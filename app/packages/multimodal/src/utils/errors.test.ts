import { describe, expect, it } from "vitest";

import { errorMessage, toError } from "./errors";

describe("source-neutral error helpers", () => {
  it("preserves Error messages", () => {
    expect(errorMessage(new Error("Invalid MCAP footer"))).toBe(
      "Invalid MCAP footer",
    );
  });

  it("normalizes non-Error values", () => {
    expect(toError("worker failed")).toEqual(new Error("worker failed"));
  });
});
