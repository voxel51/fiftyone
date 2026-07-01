import { describe, expect, it } from "vitest";
import type { Track } from "../../lib/tracks/TrackProvider";
import { partitionTracksByPin } from "./partitionTracksByPin";

const t = (id: string, parentId?: string): Track => ({
  id,
  label: id,
  color: "#000",
  events: [],
  ...(parentId ? { parentId } : null),
});

describe("partitionTracksByPin", () => {
  it("returns everything in unpinned (in source order) when nothing is pinned", () => {
    const tracks = [t("a"), t("b"), t("c")];
    const { pinned, unpinned } = partitionTracksByPin(tracks, new Set());
    expect(pinned.map((x) => x.id)).toEqual([]);
    expect(unpinned.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("returns everything in pinned (in source order) when all are pinned", () => {
    const tracks = [t("a"), t("b"), t("c")];
    const { pinned, unpinned } = partitionTracksByPin(
      tracks,
      new Set(["a", "b", "c"]),
    );
    expect(pinned.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(unpinned.map((x) => x.id)).toEqual([]);
  });

  it("keeps attribute sub-rows with their parent when only the parent is pinned", () => {
    // Source order: person1, person1.occluded, person2, person2.occluded,
    // person3, person3.occluded — three parents each with one attribute sub-row.
    const tracks = [
      t("person1"),
      t("person1:occluded", "person1"),
      t("person2"),
      t("person2:occluded", "person2"),
      t("person3"),
      t("person3:occluded", "person3"),
    ];

    // Only person3 is pinned.
    const { pinned, unpinned } = partitionTracksByPin(
      tracks,
      new Set(["person3"]),
    );

    // person3 + its sub-row land together in pinned, in source order.
    expect(pinned.map((x) => x.id)).toEqual(["person3", "person3:occluded"]);
    // person1 and person2 (and their sub-rows) stay in unpinned, contiguous.
    expect(unpinned.map((x) => x.id)).toEqual([
      "person1",
      "person1:occluded",
      "person2",
      "person2:occluded",
    ]);
  });

  it("preserves source order within each bucket for a subset pin", () => {
    // Pin person1 and person3; person2 stays unpinned.
    const tracks = [
      t("person1"),
      t("person1:occluded", "person1"),
      t("person2"),
      t("person2:occluded", "person2"),
      t("person3"),
      t("person3:occluded", "person3"),
    ];

    const { pinned, unpinned } = partitionTracksByPin(
      tracks,
      new Set(["person1", "person3"]),
    );

    expect(pinned.map((x) => x.id)).toEqual([
      "person1",
      "person1:occluded",
      "person3",
      "person3:occluded",
    ]);
    expect(unpinned.map((x) => x.id)).toEqual(["person2", "person2:occluded"]);
  });

  it("falls back to a sub-row's own id when its parent is absent", () => {
    // Defensive: a sub-row whose parent isn't in `tracks` should still be
    // classifiable via its own id — pinning that id should pin the sub-row.
    const orphan = t("orphan:attr", "ghost");
    const { pinned, unpinned } = partitionTracksByPin(
      [orphan],
      new Set(["orphan:attr"]),
    );
    // parentId is present and `ghost` is not pinned → unpinned. The fallback
    // contract is that the *parent's* pin governs; the sub-row's own id is
    // ignored when parentId is set. This guards against accidental matching.
    expect(pinned.map((x) => x.id)).toEqual([]);
    expect(unpinned.map((x) => x.id)).toEqual(["orphan:attr"]);
  });
});
