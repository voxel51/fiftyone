import { describe, expect, it } from "vitest";
import {
  countSelection,
  normalizeSelectionMembers,
  sameSelection,
  updateEpisodeSelection,
} from "./model";
import type { EpisodeSelection, SelectionMember } from "./types";

const segment = (
  start: string,
  end: string,
  provider = "events",
  streams = ["front"],
): SelectionMember => ({
  episodeId: "a",
  kind: "segment",
  range: {
    start,
    end,
    timebase: "timestamp-ns",
    streams,
    provenance: [{ provider, source: "field" }],
  },
});
const group = (...members: SelectionMember[]): EpisodeSelection => ({
  episodeId: "a",
  members,
});

describe("episode selection", () => {
  it("preserves exact timestamps and combines provenance without merging overlaps", () => {
    const ranges = normalizeSelectionMembers([
      segment("9007199254740993", "9007199254741003"),
      segment("9007199254740993", "9007199254741003", "tags"),
      segment("9007199254741000", "9007199254741010"),
    ]);
    expect(ranges).toHaveLength(2);
    expect(
      ranges[0].kind === "segment" && ranges[0].range.provenance,
    ).toHaveLength(2);
  });

  it("normalizes streams and ignores provider ordering when comparing captures", () => {
    expect(
      sameSelection(
        group(segment("1", "5", "events", ["rear", "front", "front"])),
        group(segment("01", "5", "tags", ["front", "rear"])),
      ),
    ).toBe(true);
    expect(
      sameSelection(
        group(segment("1", "5")),
        group(segment("1", "5", "tags", ["rear"])),
      ),
    ).toBe(false);
  });

  it("accumulates disjoint ranges in one card and only replaces scope explicitly", () => {
    const full = group({ episodeId: "a", kind: "episode" });
    const first = group(segment("0", "10"));
    const next = group(segment("20", "30", "tags"));
    expect(updateEpisodeSelection(first, next, "add").members).toHaveLength(2);
    expect(updateEpisodeSelection(first, next, "replace").members).toEqual(
      next.members,
    );
    expect(updateEpisodeSelection(full, first, "add")).toBe(full);
    expect(updateEpisodeSelection(first, full, "add")).toBe(first);
    expect(updateEpisodeSelection(full, first, "replace").members).toEqual(
      first.members,
    );
  });

  it("distinguishes cards, full episodes, and segments", () => {
    expect(
      countSelection([
        group(segment("0", "10"), segment("20", "30")),
        { episodeId: "b", members: [{ episodeId: "b", kind: "episode" }] },
      ]),
    ).toEqual({
      episodes: 2,
      fullEpisodes: 1,
      segments: 2,
      segmentEpisodes: 1,
      unavailable: 0,
    });
  });

  it("rejects mixed tray cards and empty ranges", () => {
    expect(() =>
      updateEpisodeSelection(
        undefined,
        group(segment("0", "10"), { episodeId: "a", kind: "episode" }),
        "replace",
      ),
    ).toThrow("either");
    expect(() => normalizeSelectionMembers([segment("1", "1")])).toThrow(
      "half-open",
    );
  });
});
