import { describe, expect, it } from "vitest";
import { episodeCameraScopeKey } from "./episode-camera-scope";

describe("episodeCameraScopeKey", () => {
  it("isolates datasets and selected media fields", () => {
    expect(episodeCameraScopeKey("dataset-a", "mcap")).not.toBe(
      episodeCameraScopeKey("dataset-a", "alternate_mcap"),
    );
    expect(episodeCameraScopeKey("dataset-a", "mcap")).not.toBe(
      episodeCameraScopeKey("dataset-b", "mcap"),
    );
  });

  it("normalizes whitespace and uses an explicit default field", () => {
    expect(episodeCameraScopeKey(" dataset-a ", " mcap ")).toBe(
      episodeCameraScopeKey("dataset-a", "mcap"),
    );
    expect(episodeCameraScopeKey("dataset-a", undefined)).toBe(
      '["dataset-a",["default"]]',
    );
    expect(episodeCameraScopeKey("dataset-a", undefined)).not.toBe(
      episodeCameraScopeKey("dataset-a", "__default__"),
    );
  });

  it("rejects an empty owner scope", () => {
    expect(episodeCameraScopeKey("  ", "mcap")).toBeNull();
  });
});
