import { describe, expect, it } from "vitest";
import { cameraScopeKey } from "./camera-scope";

describe("cameraScopeKey", () => {
  it("isolates datasets and selected media fields", () => {
    expect(cameraScopeKey("dataset-a", "mcap")).not.toBe(
      cameraScopeKey("dataset-a", "alternate_mcap"),
    );
    expect(cameraScopeKey("dataset-a", "mcap")).not.toBe(
      cameraScopeKey("dataset-b", "mcap"),
    );
  });

  it("normalizes whitespace and uses an explicit default field", () => {
    expect(cameraScopeKey(" dataset-a ", " mcap ")).toBe(
      cameraScopeKey("dataset-a", "mcap"),
    );
    expect(cameraScopeKey("dataset-a", undefined)).toBe(
      '["dataset-a",["default"]]',
    );
    expect(cameraScopeKey("dataset-a", undefined)).not.toBe(
      cameraScopeKey("dataset-a", "__default__"),
    );
  });

  it("rejects an empty owner scope", () => {
    expect(cameraScopeKey("  ", "mcap")).toBeNull();
  });
});
