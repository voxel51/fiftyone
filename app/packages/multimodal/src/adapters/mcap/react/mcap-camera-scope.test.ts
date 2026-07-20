import { describe, expect, it } from "vitest";
import { mcapCameraScopeKey } from "./mcap-camera-scope";

describe("mcapCameraScopeKey", () => {
  it("isolates datasets and selected media fields", () => {
    expect(mcapCameraScopeKey("dataset-a", "mcap")).not.toBe(
      mcapCameraScopeKey("dataset-a", "alternate_mcap"),
    );
    expect(mcapCameraScopeKey("dataset-a", "mcap")).not.toBe(
      mcapCameraScopeKey("dataset-b", "mcap"),
    );
  });

  it("normalizes whitespace and uses an explicit default field", () => {
    expect(mcapCameraScopeKey(" dataset-a ", " mcap ")).toBe(
      mcapCameraScopeKey("dataset-a", "mcap"),
    );
    expect(mcapCameraScopeKey("dataset-a", undefined)).toBe(
      '["dataset-a",["default"]]',
    );
    expect(mcapCameraScopeKey("dataset-a", undefined)).not.toBe(
      mcapCameraScopeKey("dataset-a", "__default__"),
    );
  });

  it("rejects an empty owner scope", () => {
    expect(mcapCameraScopeKey("  ", "mcap")).toBeNull();
  });
});
