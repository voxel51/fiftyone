/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { statusOf } from "./ExpressionEditor";

describe("statusOf", () => {
  it("invites when there is nothing yet", () => {
    expect(statusOf("")).toEqual({ state: "empty" });
    expect(statusOf("   ")).toEqual({ state: "empty" });
  });

  it("confirms a well-formed expression", () => {
    expect(statusOf('F("label") == "cat"')).toEqual({ state: "valid" });
    expect(statusOf("F(label) == 'cat'")).toEqual({ state: "valid" });
  });

  it("explains one that is not", () => {
    const status = statusOf('F("label') as { state: string; message: string };
    expect(status.state).toBe("invalid");
    expect(status.message).toMatch(/[Uu]nterminated string/);
  });

  it("treats a half-typed expression as not yet valid", () => {
    expect(statusOf('F("label").').state).toBe("invalid");
  });

  it("lets a rejection reason outrank what the text says", () => {
    // The value parses, but the server-side rule refused it anyway
    expect(statusOf('F("label")', "Required")).toEqual({
      state: "invalid",
      message: "Required",
    });
  });
});
