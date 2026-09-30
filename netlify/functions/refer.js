import { SYSTEM_PROMPT } from "../lib/systemPrompt.js";
import { safeLook } from "../lib/look.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, OWNER_SOURCE_ADDENDUM, directiveFor } from "../lib/publicRecord.js";
import { callClaude, ScoreError, dollarsOf } from "../lib/score.js";
import { factCheck } from "../lib/factCheck.js";
import { isCaseId, normalizeAssessment, computeScore, getTier, cube, harmGated, needsHarmReview, medianAssessment, medianSeverity, MIN_ASSESSED, assessedCount } from "../lib/intake.js";
import { MAX_SOURCES, sourceUrlError, fetchSources, sourceRecord } from "../lib/ownerSource.js";
import { normOrigin } from "../../src/origin.js";
import { slugify } from "../../src/figures.js";
import { nameError, cleanName, resolveTitle, resolveCandidates, needsChoice, safeToAssume, searchHumans, qualifierFrom, matchesName, onFileByQid, fetchArticleText, onFileFigure, placeReferral, publicFigure, isHeadOfStateOrGov, originsOf, staturesOf, REJECT, PER_CASE_MONTHLY, remainingThisMonth } from "../lib/refer.js";
import { displayName } from "../../src/figures.js";
import { getCase, hitLimit, refundLimit, peekLimit, getFigure, createFigure, listFigures } from "../lib/store.js";
import { EXCLUDED_LINE, excludedAmong } from "../lib/excluded.js";
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
      if (prior?.removed && prior?.excluded) return json(403, { error: EXCLUDED_LINE, reason: "excluded" });
      if (prior?.removed) return json(410, { error: REJECT.withdrawn, reason: "withdrawn" });
      if (prior?.name) return json(200, onFileBody(publicFigure(prior)));
    } catch { /* fall through */ }
    return null;
  };
  if (!assessed) {
    if (!title) { const hit = await typedOnFile(); if (hit) return hit; }
    return json(403, { error: NOT_ASSESSED, reason: "unassessed" });
  }

  // Owner-only: a public official with no Wikipedia article, filed from public source links
  // (Scott, 2026-09-30). Anyone else's sources are ignored: the name goes through the
  // Wikipedia desk like every referral, and no article is still "No public record".
  if (isOwner(caseId) && body?.sources != null) return ownerSourceReferral({ json, name, caseId, sources: body.sources });

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

  // Founders and prophets of the world's faiths are not assessed (lib/excluded.js). The
  // refusal is free: the lookup slots it took are handed back.
  const excludedRefusal = async () => {
    if (!isOwner(caseId)) await Promise.all([refundLimit(`refer-ip:${ip}`), refundLimit("refer-lookup-global")]).catch(() => {});
    return json(403, { error: EXCLUDED_LINE, reason: "excluded" });
  };

  let wiki, qualifier = null;
  if (title) {
    wiki = await resolveTitle(title);
    if (wiki.ok) {
      const c = await resolveCandidates(name);
      if (c.ok && needsChoice(c.candidates)) qualifier = qualifierFrom(wiki.title, wiki.description);
    }
  } else {
    // The Department acts on a name alone only when it is unambiguous and the match is
    // notable. Everything else is a list the referrer picks from: namesakes, a lone
    // obscure match ("The Iceman" the performer), or search guesses for a nickname.
    const offer = async (list, message) => {
      // Nothing is charged beyond the lookup: the referrer picks, then POSTs the title.
      let byQid = new Map();
      try { byQid = new Map((await listFigures()).filter(f => f.wikidata).map(f => [f.wikidata, f])); } catch { /* unmarked */ }
      const sealed = await excludedAmong(list.map(k => k.qid));
      if (list.every(k => sealed.has(k.qid))) return excludedRefusal();
      const candidates = list.map(k => {
        const fig = onFileByQid(k.qid);
        const ref = byQid.get(k.qid);
        const onFile = fig ? { score: fig.score, slug: slugify(fig.name) } : ref ? { score: ref.score, slug: ref.slug } : null;
        // The name to file under: the title without its qualifier, so a guess ("Richard
        // Kuklinski" for "The Iceman") passes the title check on the follow-up POST.
        return { title: k.title, name: k.title.replace(/\s*\([^)]*\)\s*$/, ""), description: k.description, born: k.born, died: k.died, qid: k.qid, onFile, excluded: sealed.has(k.qid) };
      });
      return json(200, { status: "choose", reason: "choose", name, message, candidates });
    };
    const c = await resolveCandidates(name);
    if (!c.ok) {
      const hit = await typedOnFile(); if (hit) return hit;
      return json(503, { error: REJECT.lookup, reason: "lookup" });
    }
    if (needsChoice(c.candidates)) return offer(c.candidates, `Multiple subjects answer to "${name}". Specify.`);
    let guesses = [];
    if (safeToAssume(c.candidates)) wiki = await resolveTitle(c.candidates[0].title);
    else {
      guesses = await searchHumans(name);
      // Typed with its qualifier ("Joe Jackson musician"): the exact title, not a guess.
      const exact = !c.candidates.length && guesses.find(g => slugify(g.title) === slugify(name));
      if (exact) wiki = await resolveTitle(exact.title);
    }
    if (!wiki) {
      const list = [...c.candidates, ...guesses.filter(g => !c.candidates.some(k => k.qid === g.qid))].slice(0, 8);
      if (!list.length) return json(422, { error: REJECT.none, reason: "none" });
      return offer(list, c.candidates.length
        ? `Only an obscure file answers to "${name}". The Department does not guess. Specify, or use the full name.`
        : `No subject answers exactly to "${name}". The Department has guesses. It acts on none of them without you. Not listed? Use the full name.`);
    }
  }
  if (wiki.ok && wiki.wikidata && (await excludedAmong([wiki.wikidata])).has(wiki.wikidata)) return excludedRefusal();
  if (!wiki.ok) return json(wiki.reason === "lookup" ? 503 : 422, { error: REJECT[wiki.reason] || REJECT.none, reason: wiki.reason });

  try {
    const place = await placeReferral(wiki, getFigure);
    if (place.onFile) return json(200, onFileBody(onFileCard(place.onFile)));
    if (place.existing?.removed && place.existing?.excluded) return excludedRefusal();
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
    const origin = (await originsOf([wiki.wikidata])).get(wiki.wikidata) ?? null;
    const stature = (await staturesOf([wiki.wikidata])).get(wiki.wikidata) || {};
    const look = safeLook(typeof raw?.sprite_look === "string" ? raw.sprite_look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK) : "");
    const card = {
      slug, name: stripped, qualifier, wikiTitle: wiki.title, wikidata: wiki.wikidata, origin, height: stature.height ?? null, sex: stature.sex ?? null,
      score, tier: getTier(score), ...cube(a.breakdown), breakdown: a.breakdown, confidence: null, verdict: a.verdict,
      verdictStatus, living: wiki.living, born: wiki.born, died: wiki.died,
      factCheck: fc ? { checked: fc.checked, removed: fc.removed, guard: fc.guard ?? null, regenerated: Boolean(fc.regenerated), at: new Date().toISOString() } : null,
      noDangle: raw?.no_dangle === true,
      // A living candidate in an election not yet held: the file says the Department does not vote.
      candidate: wiki.living && raw?.pending_candidate === true,
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

// ---- owner-added local public officials ------------------------------------------------
// The sources are the whole record: fetched server side (lib/ownerSource.js, SSRF-safe,
// 200 KB cap), scored three times on them alone and the per-dimension median kept, then
// fact-checked against the same text under the living-subject guard. No Wikidata: no
// birth, death, height or sex; origin only when the sources make the country plain.
// No regeneration: a verdict that mostly fails the check is withheld, not rewritten.
const SOURCE_RUNS = 3;
const GENERIC_SKIN = "medium";   // no photo lookup for these files: the likeness is generic
async function ownerSourceReferral({ json, name, caseId, sources: given }) {
  const urls = Array.isArray(given) ? [...new Set(given.map(u => String(u || "").trim()).filter(Boolean))] : [];
  if (!urls.length || urls.length > MAX_SOURCES) return json(400, { error: `Give one to ${MAX_SOURCES} public source links.`, reason: "sources" });
  const bad = urls.map(u => [u, sourceUrlError(u)]).filter(([, e]) => e);
  if (bad.length) return json(400, { error: `Source refused: ${bad.map(([u, e]) => `${u.slice(0, 80)} (${e})`).join("; ")}.`, reason: "sources" });

  // The source path is for people WITHOUT an article. Someone with one files by name.
  const c = await resolveCandidates(name);
  if (!c.ok) return json(503, { error: REJECT.lookup, reason: "lookup" });
  if (c.candidates.length) return json(409, { error: "This subject has a Wikipedia article. File the name; the source desk is for officials without one.", reason: "hasArticle", candidates: c.candidates.slice(0, 3).map(k => ({ title: k.title, description: k.description })) });

  const base = slugify(name);
  if (!base || RESERVED_SLUGS_OWNER.has(base)) return json(422, { error: REJECT.ambiguous, reason: "ambiguous" });
  try {
    const prior = await getFigure(base);
    if (prior?.removed && prior?.excluded) return json(403, { error: EXCLUDED_LINE, reason: "excluded" });
    if (prior?.removed && prior?.source === "owner-source") return json(410, { error: REJECT.withdrawn, reason: "withdrawn" });
    if (prior?.name && prior.source === "owner-source") return json(200, onFileBody(publicFigure(prior)));
  } catch (err) {
    console.error("owner-source read failed", err);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  const fetched = await fetchSources(urls);
  if (!fetched.sources.length) return json(422, { error: "None of the sources could be read. The Department files nothing it has not read.", reason: "sources", dropped: fetched.dropped });
  const record = sourceRecord(fetched.sources);
  if (!(await chargeGlobal(SOURCE_RUNS + 1))) return json(503, { error: GLOBAL_CAP_LINE, caseId }, { "Retry-After": "3600" });

  const usage = [];
  try {
    const user = `PUBLIC OFFICIAL: ${name}\nSTATUS: living\n(If you cite a directive, cite Directive ${directiveFor(name)}.)\n\nSOURCES:\n${record}`;
    const settled = await Promise.allSettled(Array.from({ length: SOURCE_RUNS }, () => callClaude(SYSTEM_PROMPT + PUBLIC_RECORD + OWNER_SOURCE_ADDENDUM, user, { usage })));
    const raws = settled.filter(r => r.status === "fulfilled" && r.value && typeof r.value === "object").map(r => r.value);
    if (!raws.length) { const e = settled.find(r => r.status === "rejected")?.reason; throw e instanceof ScoreError ? e : new ScoreError("The Assessment Engine produced nothing usable. Resubmit."); }
    const most = pred => raws.filter(pred).length * 2 > raws.length;
    if (most(r => r.is_human_public_figure === false)) return json(422, { error: REJECT.notHuman, reason: "notHuman", caseId });
    const declined = raws.map(r => r.decline).find(d => DECLINE.has(d) && most(r => r.decline === d));
    if (declined) return json(422, { error: REJECT[declined], reason: declined, caseId });

    // Model confidence kept: a dimension the sources don't cover stays unassessed.
    const readings = raws.map(r => ({ raw: r, a: normalizeAssessment(r) }));
    const med = medianAssessment(readings.map(x => x.a));
    const closest = readings.reduce((b, x) => (dist(x.a.breakdown, med.breakdown) < dist(b.a.breakdown, med.breakdown) ? x : b));
    const raw = closest.raw;
    const severity = medianSeverity(readings.map(x => x.a.harm?.severity ?? null));
    const a = { ...closest.a, breakdown: med.breakdown };

    let verdict = a.verdict, verdictStatus = "withheld", fc = null;
    try {
      fc = await factCheck({ name, deceased: false, source: record, verdict, usage });
      if (fc.verdict && !fc.mostlyFailed) { verdict = fc.verdict; verdictStatus = "published"; }
    } catch (err) {
      console.error("owner-source fact-check failed; verdict withheld", err?.message || err);
    }

    const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "") || null;
    const qualifier = str(raw.qualifier, 40)?.toLowerCase().replace(/[^a-z0-9 ,.'&-]/g, "").trim() || null;
    const score = computeScore(a.breakdown, severity);
    const harmReviewPending = needsHarmReview({ breakdown: a.breakdown, harm: a.harm, headOfState: null });
    const look = safeLook(str(raw.sprite_look, MAX_LOOK) || "");
    // Namesakes: the bare name first, then name + office; a file already holding both is not overwritten.
    const slugs = [base, qualifier && slugify(`${name} ${qualifier}`)].filter(s => s && !onFileFigure(s));
    const card = {
      slug: null, name, qualifier, wikiTitle: null, wikidata: null,
      origin: normOrigin(raw.country), height: null, sex: null,
      score, tier: getTier(score), ...cube(a.breakdown), breakdown: a.breakdown, confidence: med.confidence ?? null, verdict,
      verdictStatus, living: true, born: null, died: null,
      provisional: assessedCount(a.breakdown) < MIN_ASSESSED,
      factCheck: fc ? { checked: fc.checked, removed: fc.removed, guard: fc.guard ?? null, regenerated: false, mostlyFailed: Boolean(fc.mostlyFailed), at: new Date().toISOString() } : null,
      noDangle: raw.no_dangle === true,
      candidate: raws.some(r => r.pending_candidate === true),
      flags: a.flags, commendations: a.commendations, harm: a.harm, headOfState: null, harmReviewPending,
      sprite: null, spriteStatus: "pending", spriteAttempts: 0, look, skin: GENERIC_SKIN, likeness: "generic",
      source: "owner-source", localOfficial: true,
      sources: fetched.sources.map(s => s.url), sourcesDropped: fetched.dropped,
      stratum: { pool: "local-official", domain: "politics", occupation: str(raw.occupation, 30)?.toLowerCase() || null },
      description: str(raw.description, 110),
      runScores: readings.map(x => x.a.score),
      cost: { dollars: Math.round(dollarsOf(usage) * 10000) / 10000, calls: usage.length, input: usage.reduce((t, u) => t + u.input, 0), output: usage.reduce((t, u) => t + u.output, 0) },
      referredBy: caseId.slice(-4), at: new Date().toISOString(),
    };
    for (const slug of slugs) {
      const taken = await getFigure(slug);
      if (taken) continue;
      if (await createFigure({ ...card, slug })) {
        const made = { ...card, slug };
        return json(201, { status: "created", message: `New arrival processed: ${displayName(made)}. Filed from ${card.sources.length} public source${card.sources.length === 1 ? "" : "s"}. Likeness pending, and generic.`, subject: publicFigure(made), caseId, remaining: null, dropped: fetched.dropped, cost: card.cost, verdictStatus });
      }
    }
    return json(409, { error: REJECT.ambiguous, reason: "ambiguous", caseId });
  } catch (err) {
    if (err instanceof ScoreError) return json(err.status, { error: err.message });
    console.error("owner-source referral failed", err);
    return json(500, { error: "The referral desk suffered an internal failure. The paperwork has been lost. It will be blamed on you." });
  }
}
const RESERVED_SLUGS_OWNER = new Set(["index"]);
const dist = (x, y) => Object.keys(y || {}).reduce((t, d) => t + (typeof x?.[d] === "number" && typeof y[d] === "number" ? Math.abs(x[d] - y[d]) : (x?.[d] == null) !== (y[d] == null) ? 50 : 0), 0);

export const config = { path: "/api/refer" };
