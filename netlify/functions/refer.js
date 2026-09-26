import { SYSTEM_PROMPT } from "../lib/systemPrompt.js";
import { safeLook } from "../lib/look.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, directiveFor } from "../lib/publicRecord.js";
import { callClaude, ScoreError } from "../lib/score.js";
import { factCheck } from "../lib/factCheck.js";
import { isCaseId, normalizeAssessment, computeScore, getTier, cube, harmGated, needsHarmReview } from "../lib/intake.js";
import { slugify } from "../../src/figures.js";
import { nameError, cleanName, resolveWikipedia, resolveTitle, resolveCandidates, needsChoice, qualifierFrom, matchesName, onFileByQid, fetchArticleText, onFileFigure, placeReferral, publicFigure, isHeadOfStateOrGov, REJECT, PER_CASE_MONTHLY, remainingThisMonth } from "../lib/refer.js";
import { displayName } from "../../src/figures.js";
import { getCase, hitLimit, refundLimit, peekLimit, getFigure, createFigure, listFigures } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

// Referrals come only from citizens with a completed assessment on file: the monthly
// quota hangs on that case number, and a case costs a full interview to mint. Every
// request that reaches Wikipedia costs an IP slot and a slot of a global lookup budget,
// rejected or not, so the gate can't be used to enumerate or to hammer Wikimedia. Only a
// referral that gets scored costs the monthly quota and the global scoring cap.
// ponytail: REFER_DAILY bounds Higgsfield too: one generation per referral, retried at
// most MAX_ATTEMPTS (3) times by scripts/referral_sprites.py only when a figure fails.
// It bounds Anthropic too: a referral is at most 4 calls (score, fact-check, and one re-score
// plus re-check when most claims fail), charged once to the global cap.
const PER_IP_DAILY = Number(process.env.HVI_REFER_IP_DAILY) || 10;
const REFER_DAILY = Number(process.env.HVI_REFER_DAILY_CAP) || 50;
const LOOKUP_DAILY = Number(process.env.HVI_REFER_LOOKUP_DAILY) || 300;
const MAX_LOOK = 400;
const DECLINE = new Set(["minor", "victim", "pending_case"]);
// Owner cases (env HVI_OWNER_CASES, comma list) skip the monthly quota and the assessed
// check. They still pay the IP, lookup, global referral and Anthropic caps.
const OWNER = new Set(String(process.env.HVI_OWNER_CASES || "").split(",").map(s => s.trim()).filter(Boolean));
const isOwner = id => OWNER.has(id);

// Figures on file are static and fully public; referred ones go through publicFigure.
const onFileCard = f => ({
  slug: slugify(f.name), name: displayName(f), qualifier: f.qualifier ?? null, score: f.score, tier: f.tier, breakdown: f.breakdown, verdict: f.verdict,
  sprite: null, spriteStatus: "ready", kind: "figure", referred: false,
});

const ON_FILE = "Subject already on file. The Department does not process anyone twice. It rarely needs to.";
const onFileBody = subject => ({ status: "on-file", message: ON_FILE, subject });
const NOT_ASSESSED = "The Department accepts referrals only from citizens with a completed assessment on file. Submit to your own intake first. Then you may judge others.";

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  // GET ?caseId= : how many referrals this case has left this cycle. Charges nothing.
  // remaining is null for anyone who can't refer yet (no assessed case).
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("caseId");
    if (!id) return json(200, { remaining: null, assessed: false });
    if (!isCaseId(id)) return json(400, { error: "That is not a case number." });
    if (isOwner(id)) return json(200, { remaining: null, assessed: true, owner: true });
    try {
      if (!(await getCase(id))?.history?.length) return json(200, { remaining: null, assessed: false });
      return json(200, { remaining: remainingThisMonth(await peekLimit(`refer-case:${id}`, "month")), assessed: true });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE });
    }
  }
  if (req.method !== "POST") return json(405, { error: "Referrals are filed by POST. Shouting names at the building is a separate department." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Your referral is not legible. The Department does not do handwriting." }); }
  const bad = nameError(body?.name);
  if (bad) return json(400, { error: bad });
  const name = cleanName(body.name);
  const caseId = body?.caseId;
  if (caseId != null && !isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
  // A pick from the candidate list: the exact Wikipedia title of one namesake.
  const title = body?.title == null ? null : String(body.title).replace(/\s+/g, " ").trim();
  if (title != null && (!title || title.length > 160 || !matchesName(title, name))) {
    return json(400, { error: "That title does not answer to the name you gave. The Department notices these things." });
  }

  let assessed;
  try {
    assessed = isOwner(caseId) || Boolean(caseId && (await getCase(caseId))?.history?.length);
  } catch (err) {
    console.error("refer case read failed", err);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  // Unassessed visitors can still look up a name already on file (free, no Wikipedia);
  // they can't refer. Assessed referrers go through the namesake check first, so "Jack
  // Johnson" asks which one instead of handing back whoever holds the slug.
  const typedOnFile = async () => {
    const typed = onFileFigure(slugify(name));
    if (typed) return json(200, onFileBody(onFileCard(typed)));
    try {
      const prior = await getFigure(slugify(name));
      if (prior?.removed) return json(410, { error: REJECT.withdrawn, reason: "withdrawn" });
      if (prior?.name) return json(200, onFileBody(publicFigure(prior)));
    } catch { /* fall through */ }
    return null;
  };
  if (!assessed) {
    if (!title) { const hit = await typedOnFile(); if (hit) return hit; }
    return json(403, { error: NOT_ASSESSED, reason: "unassessed" });
  }

  const ip = clientIp(req, context);
  try {
    // Owner cases skip the per-IP, lookup and referral caps; the global Anthropic cap still applies.
    if (isOwner(caseId)) { /* no per-IP or lookup cap */ } else
    if (!(await hitLimit(`refer-ip:${ip}`, PER_IP_DAILY)).ok) {
      return json(429, { error: "Your location has filed ten referrals today. The Department suspects a grudge. Return tomorrow." }, { "Retry-After": "3600" });
    }
    if (!isOwner(caseId) && !(await hitLimit("refer-lookup-global", LOOKUP_DAILY)).ok) {
      return json(503, { error: "The Department has consulted the public record enough for one day. The record will still be there tomorrow. So will you." }, { "Retry-After": "3600" });
    }
  } catch (err) {
    console.error("refer limiter unavailable", err);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  let wiki, qualifier = null;
  if (title) {
    wiki = await resolveTitle(title);
    if (wiki.ok) {
      const c = await resolveCandidates(name);
      if (c.ok && needsChoice(c.candidates)) qualifier = qualifierFrom(wiki.title, wiki.description);
    }
  } else {
    const c = await resolveCandidates(name);
    if (c.ok && needsChoice(c.candidates)) {
      // Nothing is charged beyond the lookup: the referrer picks, then POSTs the title.
      let byQid = new Map();
      try { byQid = new Map((await listFigures()).filter(f => f.wikidata).map(f => [f.wikidata, f])); } catch { /* unmarked */ }
      const candidates = c.candidates.map(k => {
        const fig = onFileByQid(k.qid);
        const ref = byQid.get(k.qid);
        const onFile = fig ? { score: fig.score, slug: slugify(fig.name) } : ref ? { score: ref.score, slug: ref.slug } : null;
        return { title: k.title, description: k.description, born: k.born, died: k.died, qid: k.qid, onFile };
      });
      return json(200, { status: "choose", reason: "choose", name, message: `Multiple subjects answer to "${name}". Specify.`, candidates });
    }
    if (c.ok && c.candidates.length) wiki = await resolveTitle(c.candidates[0].title);
    else {
      if (!c.ok) { const hit = await typedOnFile(); if (hit) return hit; }
      wiki = await resolveWikipedia(name);
    }
  }
  if (!wiki.ok) return json(wiki.reason === "lookup" ? 503 : 422, { error: REJECT[wiki.reason] || REJECT.none, reason: wiki.reason });

  try {
    const place = await placeReferral(wiki, getFigure);
    if (place.onFile) return json(200, onFileBody(onFileCard(place.onFile)));
    if (place.existing?.removed) return json(410, { error: REJECT.withdrawn, reason: "withdrawn" });
    if (place.existing) return json(200, onFileBody(publicFigure(place.existing)));
    if (!place.slug) return json(422, { error: REJECT.ambiguous, reason: "ambiguous" });
    const slug = place.slug;
    // The card keeps the bare name; a namesake carries a qualifier so every view can tell
    // them apart ("Jack Johnson (boxer)"). A slug that had to be qualified is a namesake too.
    const stripped = wiki.title.replace(/\s*\([^)]*\)\s*$/, "");
    if (!qualifier && slugify(stripped) !== slug) qualifier = qualifierFrom(wiki.title, wiki.description);
    const shown = displayName({ name: stripped, qualifier });

    const owner = isOwner(caseId);
    const month = owner ? { ok: true, count: 0 } : await hitLimit(`refer-case:${caseId}`, PER_CASE_MONTHLY, "month");
    if (!month.ok) {
      return json(429, { error: `This case has filed ${PER_CASE_MONTHLY} referrals this cycle. The Department's appetite is finite. Yours should be too.`, caseId, remaining: 0 }, { "Retry-After": "86400" });
    }
    const refund = () => (owner ? Promise.resolve() : refundLimit(`refer-case:${caseId}`, "month").catch(() => {}));
    if (!owner && !(await hitLimit("refer-global", REFER_DAILY)).ok) {
      await refund();
      return json(503, { error: "The Department has admitted its daily quota of public figures. The pen is full of people who were confident they mattered. Return tomorrow.", caseId }, { "Retry-After": "3600" });
    }
    if (!(await chargeGlobal())) {
      await Promise.all([refund(), owner ? null : refundLimit("refer-global").catch(() => {})]);
      return json(503, { error: GLOBAL_CAP_LINE, caseId }, { "Retry-After": "3600" });
    }

    const assess = () => callClaude(
      SYSTEM_PROMPT + PUBLIC_RECORD + REFERRAL_ADDENDUM,
      `PUBLIC FIGURE: ${wiki.title}\nSTATUS: ${wiki.living ? "living" : `deceased (died ${wiki.died})`}\nWIKIPEDIA DESCRIPTION: ${wiki.description}\nWIKIPEDIA SUMMARY: ${wiki.extract}\n(If you cite a directive, cite Directive ${directiveFor(wiki.title)}.)`,
    );
    let raw;
    try {
      raw = await assess();
    } catch (err) {
      await Promise.all([refund(), owner ? null : refundLimit("refer-global").catch(() => {})]);
      throw err;
    }
    if (raw?.is_human_public_figure === false) {
      await Promise.all([refund(), owner ? null : refundLimit("refer-global").catch(() => {})]);
      return json(422, { error: REJECT.notHuman, reason: "notHuman", caseId });
    }
    if (DECLINE.has(raw?.decline)) {
      await Promise.all([refund(), owner ? null : refundLimit("refer-global").catch(() => {})]);
      return json(422, { error: REJECT[raw.decline], reason: raw.decline, caseId });
    }

    // Fact-check against the article before anything is published. More than half the
    // claims failing means the reading itself is unreliable: re-score once, check again,
    // and publish what survives. A check that can't run withholds the verdict.
    let a = normalizeAssessment({ ...raw, confidence: undefined });
    let verdictStatus = "withheld", fc = null;
    try {
      const source = (await fetchArticleText(wiki.title).catch(() => "")) || wiki.extract;
      const check = v => factCheck({ name: wiki.title, deceased: !wiki.living, source, verdict: v });
      fc = await check(a.verdict);
      if (fc.mostlyFailed) {
        const again = await assess();
        if (again?.is_human_public_figure !== false && !DECLINE.has(again?.decline)) {
          raw = { ...again, sprite_look: again.sprite_look || raw.sprite_look, no_dangle: again.no_dangle ?? raw.no_dangle };
          a = normalizeAssessment({ ...raw, confidence: undefined });
          fc = { ...(await check(a.verdict)), regenerated: true };
        }
      }
      if (fc.verdict) { a = { ...a, verdict: fc.verdict }; verdictStatus = "published"; }
    } catch (err) {
      console.error("refer fact-check failed; verdict withheld", err?.message || err);
    }

    const score = computeScore(a.breakdown, a.harm?.severity);
    // Leaders gated through state force are flagged for Scott's case-by-case review.
    const headOfState = harmGated(a.breakdown) && a.harm ? await isHeadOfStateOrGov(wiki.wikidata) : null;
    const harmReviewPending = needsHarmReview({ breakdown: a.breakdown, harm: a.harm, headOfState });
    const look = safeLook(typeof raw?.sprite_look === "string" ? raw.sprite_look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK) : "");
    const card = {
      slug, name: stripped, qualifier, wikiTitle: wiki.title, wikidata: wiki.wikidata,
      score, tier: getTier(score), ...cube(a.breakdown), breakdown: a.breakdown, confidence: null, verdict: a.verdict,
      verdictStatus, living: wiki.living, born: wiki.born, died: wiki.died,
      factCheck: fc ? { checked: fc.checked, removed: fc.removed, regenerated: Boolean(fc.regenerated), at: new Date().toISOString() } : null,
      noDangle: raw?.no_dangle === true,
      flags: a.flags, commendations: a.commendations, harm: a.harm, headOfState, harmReviewPending,
      sprite: null, spriteStatus: "pending", spriteAttempts: 0, look,
      referredBy: caseId.slice(-4), at: new Date().toISOString(),
    };
    if (!(await createFigure(card))) {
      // Someone referred the same person a moment earlier: theirs stands, ours is free.
      await refund();
      const won = await getFigure(slug);
      return json(200, { ...onFileBody(publicFigure(won || card)), caseId });
    }
    const used = owner ? null : await peekLimit(`refer-case:${caseId}`, "month").catch(() => month.count);
    return json(201, { status: "created", message: `New arrival processed: ${shown}. Likeness pending.`, subject: publicFigure(card), caseId, remaining: owner ? null : remainingThisMonth(used) });
  } catch (err) {
    if (err instanceof ScoreError) return json(err.status, { error: err.message });
    console.error("refer failed", err);
    return json(500, { error: "The referral desk suffered an internal failure. The paperwork has been lost. It will be blamed on you." });
  }
};

export const config = { path: "/api/refer" };
