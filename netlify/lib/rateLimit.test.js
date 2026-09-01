import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

describe("createRateLimiter", () => {
  it("allows `limit` requests per window then blocks", () => {
    let t = 0;
    const limited = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(true);
    expect(limited("b")).toBe(false);
  });
  it("resets after the window elapses", () => {
    let t = 0;
    const limited = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(true);
    t = 1001;
    expect(limited("a")).toBe(false);
  });
});
