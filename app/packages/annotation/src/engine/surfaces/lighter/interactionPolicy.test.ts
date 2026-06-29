import { describe, expect, it } from "vitest";

import type { LighterInteractionPolicy } from "./interactionPolicy";
import { combineInteractionPolicies } from "./interactionPolicy";

const consuming = (calls: string[], tag: string): LighterInteractionPolicy => ({
  interceptSelect: (id) => {
    calls.push(`${tag}:select:${id}`);
    return true;
  },
  interceptDeselect: (id) => {
    calls.push(`${tag}:deselect:${id}`);
    return true;
  },
});

const passing = (calls: string[], tag: string): LighterInteractionPolicy => ({
  interceptSelect: (id) => {
    calls.push(`${tag}:select:${id}`);
    return false;
  },
  interceptDeselect: (id) => {
    calls.push(`${tag}:deselect:${id}`);
    return false;
  },
});

describe("combineInteractionPolicies", () => {
  it("returns false (no consumer) for an empty list", () => {
    const policy = combineInteractionPolicies([]);

    expect(policy.interceptSelect?.("o1")).toBe(false);
    expect(policy.interceptDeselect?.("o1")).toBe(false);
  });

  it("consumes when any interceptor consumes", () => {
    const calls: string[] = [];
    const policy = combineInteractionPolicies([
      passing(calls, "a"),
      consuming(calls, "b"),
    ]);

    expect(policy.interceptSelect?.("o1")).toBe(true);
    expect(policy.interceptDeselect?.("o1")).toBe(true);
  });

  it("passes through when no interceptor consumes", () => {
    const calls: string[] = [];
    const policy = combineInteractionPolicies([
      passing(calls, "a"),
      passing(calls, "b"),
    ]);

    expect(policy.interceptSelect?.("o1")).toBe(false);
    expect(calls).toEqual(["a:select:o1", "b:select:o1"]);
  });

  it("runs interceptors in order and short-circuits at the first consumer", () => {
    const calls: string[] = [];
    const policy = combineInteractionPolicies([
      passing(calls, "first"),
      consuming(calls, "second"),
      consuming(calls, "third"),
    ]);

    policy.interceptSelect?.("o1");

    // "third" never runs — a consumed gesture has exactly one owner
    expect(calls).toEqual(["first:select:o1", "second:select:o1"]);
  });

  it("treats a missing interceptor method as non-consuming", () => {
    const calls: string[] = [];
    const policy = combineInteractionPolicies([
      { interceptDeselect: () => true }, // no interceptSelect
      consuming(calls, "b"),
    ]);

    // select skips the first (no method) and reaches the second
    expect(policy.interceptSelect?.("o1")).toBe(true);
    expect(calls).toEqual(["b:select:o1"]);

    // deselect consumed by the first, so the second never runs
    calls.length = 0;
    expect(policy.interceptDeselect?.("o1")).toBe(true);
    expect(calls).toEqual([]);
  });
});
