import { describe, expect, it } from "vitest";
import { sidebarEntryTitle } from "./useTitleTemplate";

describe("sidebarEntryTitle", () => {
  it("drops the prefix a path shares with its group", () => {
    expect(sidebarEntryTitle("metadata.size_bytes", "metadata")).toBe(
      "size_bytes",
    );
    expect(sidebarEntryTitle("signals.imu_signals", "signals")).toBe(
      "imu_signals",
    );
  });

  it("keeps the path when it is not under its group's name", () => {
    expect(sidebarEntryTitle("filepath", "primitives")).toBe("filepath");
    expect(sidebarEntryTitle("ground_truth", "labels")).toBe("ground_truth");
  });

  it("only strips whole segments", () => {
    // "signal." is a string prefix of neither — stripping on raw string
    // prefix would leave "s.imu" here.
    expect(sidebarEntryTitle("signals.imu", "signal")).toBe("signals.imu");
  });

  it("keeps the path when it equals the group name", () => {
    expect(sidebarEntryTitle("metadata", "metadata")).toBe("metadata");
  });

  it("keeps the path when there is no group", () => {
    expect(sidebarEntryTitle("metadata.size_bytes")).toBe(
      "metadata.size_bytes",
    );
  });

  it("prefers an override over stripping", () => {
    expect(sidebarEntryTitle("tags", "tags")).toBe("sample tags");
    expect(sidebarEntryTitle("_label_tags", "tags")).toBe("label tags");
    expect(sidebarEntryTitle("_temporal_tags", "tags")).toBe("temporal tags");
  });
});
