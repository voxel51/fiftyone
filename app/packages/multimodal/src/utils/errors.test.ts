import { describe, expect, it } from "vitest";

import { diagnosticMessage, errorMessage, toError } from "./errors";

describe("source-neutral error helpers", () => {
  it("preserves Error messages and applies fallbacks to unknown values", () => {
    expect(errorMessage(new Error("Invalid MCAP footer"))).toBe(
      "Invalid MCAP footer",
    );
    expect(errorMessage("worker failed", "fallback")).toBe("fallback");
    expect(errorMessage("worker failed")).toBe("worker failed");
  });

  it("uses an explicit diagnostic fallback for opaque values", () => {
    expect(errorMessage(null, "Could not open MCAP")).toBe(
      "Could not open MCAP",
    );
  });

  it("renders non-empty diagnostic text from browser and JavaScript errors", () => {
    expect(diagnosticMessage(new Error("decode failed"), "fallback")).toBe(
      "decode failed",
    );
    expect(diagnosticMessage("worker failed", "fallback")).toBe(
      "worker failed",
    );
    expect(
      diagnosticMessage({ message: "Texture upload failed" }, "fallback"),
    ).toBe("Texture upload failed");
    expect(diagnosticMessage({ message: "" }, "fallback")).toBe("fallback");
    expect(diagnosticMessage(null, "fallback")).toBe("fallback");
  });

  it("preserves existing Error identity and constructs new errors at normalization", () => {
    const existing = new TypeError("bad worker payload");
    expect(toError(existing)).toBe(existing);

    const normalized = toError("worker failed");
    expect(normalized).toEqual(new Error("worker failed"));
    expect(normalized.constructor).toBe(Error);
    expect(normalized.stack).toContain("errors.ts");
  });
});
