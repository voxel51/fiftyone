import { describe, expect, it } from "vitest";

import { dependencyCruiserGate } from "./dependency-cruiser-gate.mjs";

describe("dependency-cruiser package gate", () => {
  it("fails for a seeded error-level violation", () => {
    expect(
      dependencyCruiserGate({ summary: { error: 1, warn: 0 } }),
    ).toEqual({ error: 1, exitCode: 1, warn: 0 });
  });

  it("fails for a seeded warning-level violation", () => {
    expect(
      dependencyCruiserGate({ summary: { error: 0, warn: 1 } }),
    ).toEqual({ error: 0, exitCode: 1, warn: 1 });
  });

  it("passes only a graph without errors or warnings", () => {
    expect(
      dependencyCruiserGate({ summary: { error: 0, warn: 0 } }),
    ).toEqual({ error: 0, exitCode: 0, warn: 0 });
  });

  it("rejects malformed summaries instead of silently passing", () => {
    expect(() => dependencyCruiserGate({ summary: { error: 0 } })).toThrow(
      "summary.warn",
    );
  });
});
