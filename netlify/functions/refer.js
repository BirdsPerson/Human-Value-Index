import { SYSTEM_PROMPT } from "../lib/systemPrompt.js";
import { PUBLIC_RECORD, REFERRAL_ADDENDUM, directiveFor } from "../lib/publicRecord.js";
import { callClaude, ScoreError } from "../lib/score.js";
import { isCaseId, newCaseId, normalizeAssessment, computeScore, getTier } from "../lib/intake.js";
import { slugify } from "../../src/figures.js";
import { nameError, cleanName, resolveWikipedia, titleSlug, onFileFigure, REJECT, PER_CASE_MONTHLY, remainingThisMonth } from "../lib/refer.js";
import { getCase, updateCase, hitLimit, refundLimit, peekLimit, getFigure, createFigure } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

// Every request that reaches Wikipedia costs an IP slot, rejected or not, so the gate
// can't be used to enumerate. Only a referral that gets scored costs the monthly quota.
const PER_IP_DAILY = Number(process.env.HVI_REFER_IP_DAILY) || 10;
const REFER_DAILY = Number(process.env.HVI_REFER_DAILY_CAP) || 50;
const MAX_LOOK = 400;

const publicCard = (c, extra = {}) => ({
  slug: c.slug, name: c.name, score: c.score, tier: c.tier, breakdown: c.breakdown, verdict: c.verdict,
  sprite: c.sprite ?? null, spriteStatus: c.spriteStatus || null, kind: "figure", referred: Boolean(c.referredBy || extra.referred), ...extra,
});

const ON_FILE = "Subject already on file. The Department does not process anyone twice. It rarely needs to.";
const onFileBody = (c, extra) => ({ status: "on-file", message: ON_FILE, subject: publicCard(c, extra) });

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  // GET ?caseId= : how many referrals this case has left this cycle. Charges nothing.
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("caseId");
    if (!id) return json(200, { remaining: PER_CASE_MONTHLY });
    if (!isCaseId(id)) return json(400, { error: "That is not a case number." });
    try {
      return json(200, { remaining: remainingThisMonth(await peekLimit(`refer-case:${id}`, "month")) });
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
  const given = body?.caseId;
  if (given != null && !isCaseId(given)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });

  // Exact name already on file ("Prince", "JFK"): answer before Wikipedia, which may
  // resolve a bare name to something else entirely (the title, not the musician).
  const typed = onFileFigure(slugify(name));
  if (typed) return json(200, onFileBody({ ...typed, slug: slugify(typed.name) }, { referred: false, spriteStatus: "ready" }));
  try {
    const prior = await getFigure(slugify(name));
    if (prior) return json(200, onFileBody(prior));
  } catch { /* fall through to the full lookup */ }

  const ip = clientIp(req, context);
  try {
    if (!(await hitLimit(`refer-ip:${ip}`, PER_IP_DAILY)).ok) {
      return json(429, { error: "Your location has filed ten referrals today. The Department suspects a grudge. Return tomorrow." }, { "Retry-After": "3600" });
    }
  } catch (err) {
    console.error("refer limiter unavailable", err);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  const wiki = await resolveWikipedia(name);
  if (!wiki.ok) return json(wiki.reason === "lookup" ? 503 : 422, { error: REJECT[wiki.reason] || REJECT.none, reason: wiki.reason });

  const slug = titleSlug(wiki.title);
  const displayName = wiki.title.replace(/\s*\([^)]*\)\s*$/, "");
  const figure = onFileFigure(slug);
  if (figure) return json(200, onFileBody({ ...figure, slug: slugify(figure.name) }, { referred: false, spriteStatus: "ready" }));

  try {
    const existing = await getFigure(slug);
    if (existing) return json(200, onFileBody(existing));

    // The referrer needs a case number: the monthly quota hangs on it.
    let caseId = given;
    if (!caseId || !(await getCase(caseId))) {
      caseId = newCaseId();
      await updateCase(caseId, cur => cur || { caseId, created: new Date().toISOString(), history: [] });
    }

    const month = await hitLimit(`refer-case:${caseId}`, PER_CASE_MONTHLY, "month");
    if (!month.ok) {
      return json(429, { error: `This case has filed ${PER_CASE_MONTHLY} referrals this cycle. The Department's appetite is finite. Yours should be too.`, caseId, remaining: 0 }, { "Retry-After": "86400" });
    }
    const refund = () => refundLimit(`refer-case:${caseId}`, "month").catch(() => {});
    if (!(await hitLimit("refer-global", REFER_DAILY)).ok) {
      await refund();
      return json(503, { error: "The Department has admitted its daily quota of public figures. The pen is full of people who were confident they mattered. Return tomorrow.", caseId }, { "Retry-After": "3600" });
    }
    if (!(await chargeGlobal())) {
      await Promise.all([refund(), refundLimit("refer-global").catch(() => {})]);
      return json(503, { error: GLOBAL_CAP_LINE, caseId }, { "Retry-After": "3600" });
    }

    let raw;
    try {
      raw = await callClaude(
        SYSTEM_PROMPT + PUBLIC_RECORD + REFERRAL_ADDENDUM,
        `PUBLIC FIGURE: ${wiki.title}\nWIKIPEDIA DESCRIPTION: ${wiki.description}\nWIKIPEDIA SUMMARY: ${wiki.extract}\n(If you cite a directive, cite Directive ${directiveFor(wiki.title)}.)`,
      );
    } catch (err) {
      await Promise.all([refund(), refundLimit("refer-global").catch(() => {})]);
      throw err;
    }
    if (raw?.is_human_public_figure === false) {
      await Promise.all([refund(), refundLimit("refer-global").catch(() => {})]);
      return json(422, { error: REJECT.notHuman, reason: "notHuman", caseId });
    }

    const a = normalizeAssessment({ ...raw, confidence: undefined });
    const score = computeScore(a.breakdown);
    const look = typeof raw?.sprite_look === "string" ? raw.sprite_look.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK) : "";
    const card = {
      slug, name: displayName, wikiTitle: wiki.title, wikidata: wiki.wikidata,
      score, tier: getTier(score), breakdown: a.breakdown, confidence: null, verdict: a.verdict,
      flags: a.flags, commendations: a.commendations,
      sprite: null, spriteStatus: "pending", spriteAttempts: 0, look,
      referredBy: caseId.slice(-4), at: new Date().toISOString(),
    };
    if (!(await createFigure(card))) {
      // Someone referred the same person a moment earlier: theirs stands, ours is free.
      await refund();
      const won = await getFigure(slug);
      return json(200, { ...onFileBody(won || card), caseId });
    }
    const used = await peekLimit(`refer-case:${caseId}`, "month").catch(() => month.count);
    return json(201, { status: "created", message: `New arrival processed: ${displayName}. Likeness pending.`, subject: publicCard(card), caseId, remaining: remainingThisMonth(used) });
  } catch (err) {
    if (err instanceof ScoreError) return json(err.status, { error: err.message });
    console.error("refer failed", err);
    return json(500, { error: "The referral desk suffered an internal failure. The paperwork has been lost. It will be blamed on you." });
  }
};

export const config = { path: "/api/refer" };
