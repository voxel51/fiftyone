import { describe, expect, it } from "vitest";
import {
  countSelection,
  capturedScopeSources,
  normalizeSelectionMembers,
  sameSelection,
  updateEpisodeSelection,
  EPISODE_UNIT,
  VIDEO_UNIT,
  SAMPLE_UNIT,
  hasDynamicGroups,
  isPersistentDomain,
  memberCounts,
  selectionDomainId,
  selectionScopeLabel,
  selectionUnit,
  viewConversion,
  compactScopeLabel,
  isDefaultSelectionBuckets,
  newSelectionBucketId,
  normalizeSelectionBucketName,
  normalizeSelectionBuckets,
  routeSelectionBucket,
  selectionBucketGesture,
  selectionBucketTitle,
  selectionCaptureKey,
  selectionDomainDataset,
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

describe("unit vocabulary", () => {
  it("speaks in samples for non-temporal media and episodes otherwise", () => {
    expect(selectionUnit("image")).toEqual(SAMPLE_UNIT);
    expect(selectionUnit("3d")).toEqual(SAMPLE_UNIT);
    expect(selectionUnit("video")).toEqual(VIDEO_UNIT);
    expect(selectionUnit("multimodal")).toEqual(EPISODE_UNIT);
    expect(selectionUnit("image", "patches").many).toBe("patches");
    expect(selectionUnit("video", "clips")).toMatchObject({
      one: "clip",
      temporal: false,
    });
    const counts = {
      episodes: 3,
      fullEpisodes: 2,
      segments: 4,
      segmentEpisodes: 1,
      unavailable: 0,
    };
    expect(selectionScopeLabel(counts)).toBe(
      "2 full episodes · 4 segments across 1 episode",
    );
    expect(selectionScopeLabel({ ...counts, segments: 0 }, SAMPLE_UNIT)).toBe(
      "2 samples",
    );
    expect(
      selectionScopeLabel(
        { ...counts, fullEpisodes: 0, segments: 0 },
        SAMPLE_UNIT,
      ),
    ).toBe("0 samples");
  });
});

describe("selection domains", () => {
  it("keys converted views by their exact conversion and keeps them in memory", () => {
    const patches = {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "ground_truth"]],
    };
    const conversion = viewConversion([
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] },
      patches,
    ]);
    expect(conversion?.kind).toBe("patches");
    expect(viewConversion([{ _cls: "fiftyone.core.stages.Limit" }])).toBeNull();
    const domain = selectionDomainId("dataset", conversion?.key ?? null);
    expect(domain).not.toBe("dataset");
    expect(domain).toContain("ground_truth");
    expect(isPersistentDomain(domain)).toBe(false);
    expect(isPersistentDomain(selectionDomainId("dataset", null))).toBe(true);
  });
});

describe("scope helpers", () => {
  it("counts flat member lists and recognizes dynamic group views", () => {
    expect(
      memberCounts([
        { episodeId: "a", kind: "episode" },
        {
          episodeId: "b",
          kind: "segment",
          range: {
            start: "0",
            end: "1",
            timebase: "sequence",
            streams: ["filepath"],
            provenance: [],
          },
        },
      ]),
    ).toEqual({
      episodes: 2,
      fullEpisodes: 1,
      segments: 1,
      segmentEpisodes: 1,
      unavailable: 0,
    });
    const groupBy = (flat: boolean) => ({
      _cls: "fiftyone.core.stages.GroupBy",
      kwargs: [
        ["field_or_expr", "scene"],
        ["flat", flat],
      ],
    });
    expect(hasDynamicGroups([groupBy(false)])).toBe(true);
    expect(hasDynamicGroups([groupBy(true)])).toBe(false);
    expect(hasDynamicGroups([{ _cls: "fiftyone.core.stages.Limit" }])).toBe(
      false,
    );
  });
});

describe("selection buckets", () => {
  it("routes clicks by bucket position and treats unbound modifiers as plain clicks", () => {
    const one = [{ id: "primary" }];
    const two = [{ id: "primary" }, { id: "b" }];
    const three = [...two, { id: "c" }];
    expect(routeSelectionBucket({}, three).id).toBe("primary");
    expect(routeSelectionBucket({ metaKey: true }, three).id).toBe("b");
    expect(routeSelectionBucket({ ctrlKey: true }, three).id).toBe("b");
    expect(routeSelectionBucket({ altKey: true }, three).id).toBe("c");
    expect(
      routeSelectionBucket({ altKey: true, metaKey: true }, three).id,
    ).toBe("c");
    expect(routeSelectionBucket({ altKey: true }, two).id).toBe("primary");
    expect(routeSelectionBucket({ altKey: true, metaKey: true }, two).id).toBe(
      "b",
    );
    expect(routeSelectionBucket({ metaKey: true }, one).id).toBe("primary");
    expect(selectionBucketGesture(0)).toBe("click");
    expect(selectionBucketGesture(1)).toBe("command");
    expect(selectionBucketGesture(2)).toBe("option");
  });

  it("normalizes stored layouts: junk, duplicates, long names, unknown icons, and the cap", () => {
    expect(normalizeSelectionBuckets(null)).toEqual([{ id: "primary" }]);
    expect(normalizeSelectionBuckets([])).toEqual([{ id: "primary" }]);
    expect(
      normalizeSelectionBuckets([
        { id: "primary", name: "  Definitely keep  ", icon: "approve" },
        { id: "primary" },
        { id: "bad|id" },
        { id: "b", icon: "sparkles", name: 3 },
        "junk",
        { id: "c" },
        { id: "d" },
      ]),
    ).toEqual([
      { id: "primary", name: "Definitely", icon: "approve" },
      { id: "b" },
      { id: "c" },
    ]);
    expect(isDefaultSelectionBuckets([{ id: "primary" }])).toBe(true);
    expect(isDefaultSelectionBuckets([{ id: "primary", name: "A" }])).toBe(
      false,
    );
    expect(normalizeSelectionBucketName("   ")).toBeUndefined();
  });

  it("keys captures so the primary bucket keeps the single tray's storage", () => {
    expect(selectionCaptureKey("ds", "primary")).toBe("ds");
    expect(selectionCaptureKey("ds", "b1")).toBe("ds#b1");
    expect(isPersistentDomain("ds#b1")).toBe(true);
    expect(isPersistentDomain("ds|conv#b1")).toBe(false);
    expect(selectionDomainDataset("ds|conv")).toBe("ds");
    expect(selectionDomainDataset("ds")).toBe("ds");
    expect(selectionBucketTitle({ id: "x" }, 1)).toBe("Bucket 2");
    expect(selectionBucketTitle({ id: "x", name: "Keep" }, 1)).toBe("Keep");
    expect(newSelectionBucketId()).toMatch(/^b[a-z0-9]+$/);
  });

  it("labels a bucket's scope compactly", () => {
    const counts = (fullEpisodes: number, segments: number) => ({
      episodes: fullEpisodes,
      fullEpisodes,
      segments,
      segmentEpisodes: segments ? 1 : 0,
      unavailable: 0,
    });
    expect(compactScopeLabel(counts(1, 0), SAMPLE_UNIT)).toBe("1 sample");
    expect(compactScopeLabel(counts(2, 3), VIDEO_UNIT)).toBe(
      "2 samples · 3 segments",
    );
    expect(compactScopeLabel(counts(0, 0), SAMPLE_UNIT)).toBe("0 samples");
  });
});

it("deduplicates generated members by source identity while preserving entity kinds", () => {
  const reference = {
    type: "frame" as const,
    sampleId: "source",
    frameNumber: 3,
  };
  const original = {
    episodeId: "old-row",
    kind: "episode" as const,
    reference,
  };
  const regenerated = { ...original, episodeId: "new-row" };
  const range = {
    episodeId: "clip-row",
    kind: "episode" as const,
    reference: {
      type: "clip-range" as const,
      sampleId: "source",
      support: [3, 3] as const,
    },
  };
  expect(normalizeSelectionMembers([original, regenerated, range])).toEqual([
    regenerated,
    range,
  ]);
  expect(sameSelection(group(original), group(regenerated))).toBe(true);
});

it.each(["ToFrames", "ToClips", "ToPatches"])(
  "keeps %s boundaries when the server replaces a materialization hint",
  (stage) => {
    const view = (name: string) => [
      {
        _cls: `fiftyone.core.stages.${stage}`,
        kwargs: [
          ["config", { _subset_id: "saved" }],
          ["_state", { name }],
        ],
      },
    ];
    expect(viewConversion(view("old"))?.key).toBe(
      viewConversion(view("new"))?.key,
    );
  },
);

it("counts modal captures of the same dynamic group only once", () => {
  const captures = ["a", "b"].map((episodeId) => ({
    episodeId,
    members: [],
    group: {
      label: "scene",
      key: "same-group",
      size: 3,
      snapshotId: "snapshot",
    },
  }));
  expect(capturedScopeSources(captures).groupCount).toBe(1);
  expect(capturedScopeSources(captures).snapshotIds).toEqual(["snapshot"]);
});
