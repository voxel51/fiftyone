import { describe, expect, it } from "vitest";
import { toTitle } from "./useTitleTemplate";

describe("toTitle", () => {
  it("drops the prefix a path shares with its group", () => {
    expect(toTitle("metadata.size_bytes", "metadata")).toBe("size_bytes");
    expect(toTitle("signals.imu_signals", "signals")).toBe("imu_signals");
  });

  it("keeps the path when it is not under its group's name", () => {
    expect(toTitle("filepath", "primitives")).toBe("filepath");
    expect(toTitle("ground_truth", "labels")).toBe("ground_truth");
  });

  it("only strips whole segments", () => {
    // "signal." is a string prefix of neither — stripping on raw string
    // prefix would leave "s.imu" here.
    expect(toTitle("signals.imu", "signal")).toBe("signals.imu");
  });

  it("keeps the path when it equals the group name", () => {
    expect(toTitle("metadata", "metadata")).toBe("metadata");
  });

  it("keeps the path when there is no group", () => {
    expect(toTitle("metadata.size_bytes")).toBe("metadata.size_bytes");
  });

  it("prefers an override over stripping", () => {
    expect(toTitle("tags", "tags")).toBe("sample tags");
    expect(toTitle("_label_tags", "tags")).toBe("label tags");
    expect(toTitle("_temporal_tags", "tags")).toBe("temporal tags");
  });
});
