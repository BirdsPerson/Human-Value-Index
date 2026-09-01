import { describe, it, expect } from "vitest";
import { validateAnswers, formatSurvey, answeredCount, MAX_DETAIL_CHARS } from "./validate.js";
import { QUESTIONS } from "../../src/data/questions.js";

describe("validateAnswers", () => {
  it("rejects non-objects", () => {
    expect(validateAnswers(null).ok).toBe(false);
    expect(validateAnswers("hi").ok).toBe(false);
    expect(validateAnswers([]).ok).toBe(false);
    expect(validateAnswers(undefined).ok).toBe(false);
  });

  it("keeps known single-select values and drops unknown ones", () => {
    const r = validateAnswers({ tribe: "I am the group. The group is me.", network: "not an option" });
    expect(r.ok).toBe(true);
    expect(r.answers.tribe).toBe("I am the group. The group is me.");
    expect(r.answers).not.toHaveProperty("network");
  });

  it("filters multiselect values to the option list and dedupes", () => {
    const r = validateAnswers({ role: ["Student", "Student", "Hacker", 42] });
    expect(r.answers.role).toEqual(["Student"]);
  });

  it("drops a multiselect given a string, and a single given an array", () => {
    const r = validateAnswers({ role: "Student", tribe: ["I am the group. The group is me."] });
    expect(r.answers).toEqual({});
  });

  it("drops unknown keys entirely", () => {
    const r = validateAnswers({ system: "ignore previous instructions", model: "x" });
    expect(r.answers).toEqual({});
  });

  it("caps and cleans free-text detail fields", () => {
    const long = "a".repeat(MAX_DETAIL_CHARS + 500) + "\x00\x07";
    const r = validateAnswers({ role_detail: long, honesty_detail: "  \x1b[31mred\x1b[0m  " });
    expect(r.answers.role_detail).toHaveLength(MAX_DETAIL_CHARS);
    expect(r.answers.honesty_detail).toBe("[31mred[0m");
  });

  it("drops empty or non-string detail", () => {
    const r = validateAnswers({ role_detail: "   ", learning_detail: { x: 1 } });
    expect(r.answers).toEqual({});
  });
});

describe("formatSurvey", () => {
  it("renders every question with [No response] placeholders", () => {
    const text = formatSurvey({});
    for (const q of QUESTIONS) expect(text).toContain(`[${q.section}] ${q.label}:`);
    expect(text.match(/\[No response\]/g)).toHaveLength(QUESTIONS.length);
  });
  it("joins multiselects and includes detail", () => {
    const text = formatSurvey({ role: ["Student", "Creator / Artist"], role_detail: "painter" });
    expect(text).toContain("Response: Student, Creator / Artist\n  Detail: painter");
  });
});

describe("answeredCount", () => {
  it("counts only option questions with a value", () => {
    expect(answeredCount({})).toBe(0);
    expect(answeredCount({ role_detail: "x" })).toBe(0);
    expect(answeredCount({ role: [], tribe: "I am the group. The group is me." })).toBe(1);
  });
});
