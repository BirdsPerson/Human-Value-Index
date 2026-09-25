// File photos for citizens. The subject describes their appearance once (the last interview
// item, or the UPDATE FILE PHOTO form); a cheap model call maps it to enum values from
// src/avatar.js; only those enums are stored. The description itself is never kept, and
// the photo exchange is cut from the transcript before scoring so it is not evidence.
import { AVATAR_ENUMS, AVATAR_KEYS, CLOTH, sanitizeSpec } from "../../src/avatar.js";
import { claudeText, parseModelJson } from "./score.js";

export const PHOTO_DIM = "file photo";
export const PHOTO_Q = "For the file photo: describe your appearance. Hair, build, usual clothes, one thing you carry.";
export const MAX_DESCRIPTION = 400;
const PHOTO_ASK = /file photo|your appearance|what you look like|your likeness/i;

// { rest, description }: rest is the transcript without the photo question and its answer.
export function splitPhotoExchange(transcript) {
  const t = Array.isArray(transcript) ? transcript : [];
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i]?.role !== "agent" || !PHOTO_ASK.test(t[i].text || "")) continue;
    const j = t.findIndex((m, k) => k > i && m?.role === "user");
    if (j === -1) return { rest: t.filter((_, k) => k !== i), description: null };
    return { rest: t.filter((_, k) => k !== i && k !== j), description: String(t[j].text || "").slice(0, MAX_DESCRIPTION) };
  }
  return { rest: t, description: null };
}

export function descriptionError(d) {
  if (typeof d !== "string" || d.trim().length < 3) return "Describe yourself. Hair, build, clothes. The Department cannot draw a blank. It has tried.";
  if (d.length > MAX_DESCRIPTION) return `Keep it under ${MAX_DESCRIPTION} characters. The Department is drawing you at 32 by 48 pixels. Detail is wasted.`;
  return null;
}

const list = (k) => (Array.isArray(AVATAR_ENUMS[k]) ? AVATAR_ENUMS[k] : Object.keys(AVATAR_ENUMS[k])).join(", ");
const SYSTEM = `You map a person's description of their own appearance to a tiny pixel avatar.
Return ONLY JSON with exactly these keys, each value chosen from its list (closest match; use the first-listed sensible default when the description says nothing):
${AVATAR_KEYS.map(k => `- ${k}: ${k.endsWith("_color") && k !== "hair_color" ? Object.keys(CLOTH).join(", ") : list(k)}`).join("\n")}
Pick the accessory for the one thing they carry or wear most distinctively (hats and glasses count). No other keys, no commentary.`;

export async function extractSpec(description) {
  const text = await claudeText({
    system: SYSTEM,
    messages: [{ role: "user", content: `DESCRIPTION: ${String(description).slice(0, MAX_DESCRIPTION)}` }],
    model: "claude-haiku-4-5-20251001",
    maxTokens: 200,
  });
  return sanitizeSpec(parseModelJson(text));
}
