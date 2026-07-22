import { describe, expect, it } from "vitest";
import {
  restrictHeldMcap3dSceneSnapshotToTopics,
  selectMcap3dSceneSnapshot,
  type HeldMcap3dSceneSnapshot,
  type Mcap3dSceneSnapshot,
} from "./mcap-3d-scene-snapshot";

const EMPTY = "empty";
const READY = "ready";
const KEY = "source:topics:frame";
const GRACE_MS = 2_000;

describe("selectMcap3dSceneSnapshot", () => {
  it("commits a ready scene", () => {
    const selection = select({ current: READY, readiness: "ready" });

    expect(selection.snapshot).toBe(READY);
    expect(selection.nextHeld).toMatchObject({
      definitiveMissingSinceMs: null,
      key: KEY,
      retainable: true,
      snapshot: READY,
    });
    expect(selection.heldReason).toBeNull();
  });

  it("holds the last valid scene while placement is pending", () => {
    const held = readyHeld();
    const selection = select({ held, readiness: "pending" });

    expect(selection.snapshot).toBe(READY);
    expect(selection.nextHeld?.snapshot).toBe(READY);
    expect(selection.heldReason).toBe("pending");
  });

  it("holds source-backed definitive-missing placement for a bounded grace", () => {
    const first = select({ held: readyHeld(), nowMs: 10_000 });
    expect(first.snapshot).toBe(READY);
    expect(first.graceRemainingMs).toBe(GRACE_MS);

    const second = select({ held: first.nextHeld, nowMs: 11_999 });
    expect(second.snapshot).toBe(READY);
    expect(second.graceRemainingMs).toBe(1);
    expect(second.heldReason).toBe("definitiveMissing");
  });

  it("commits the missing scene when the grace expires", () => {
    const first = select({ held: readyHeld(), nowMs: 10_000 });
    const expired = select({ held: first.nextHeld, nowMs: 12_000 });

    expect(expired.snapshot).toBe(EMPTY);
    expect(expired.nextHeld?.retainable).toBe(false);
    expect(expired.heldReason).toBeNull();
  });

  it("commits missing immediately when source data disappears", () => {
    const selection = select({
      hasSourceData: false,
      held: readyHeld(),
      nowMs: 10_000,
    });

    expect(selection.snapshot).toBe(EMPTY);
    expect(selection.heldReason).toBeNull();
  });

  it("does not retain a scene across semantic source changes", () => {
    const selection = select({
      held: readyHeld(),
      key: "different-source",
      readiness: "pending",
    });

    expect(selection.snapshot).toBe(EMPTY);
    expect(selection.nextHeld).toBeNull();
  });

  it("resets the definitive-missing clock after placement recovers", () => {
    const missing = select({ held: readyHeld(), nowMs: 10_000 });
    const recovered = select({
      current: "recovered",
      held: missing.nextHeld,
      nowMs: 11_000,
      readiness: "ready",
    });
    const missingAgain = select({ held: recovered.nextHeld, nowMs: 50_000 });

    expect(missingAgain.snapshot).toBe("recovered");
    expect(missingAgain.graceRemainingMs).toBe(GRACE_MS);
  });
});

describe("restrictHeldMcap3dSceneSnapshotToTopics", () => {
  it("retains an existing scene while an additive source is pending", () => {
    const snapshot = sceneSnapshot({ pointCloudTopics: ["lidar"] });
    const held = sceneHeld(snapshot);

    const restricted = restrictHeldMcap3dSceneSnapshotToTopics(
      held,
      new Set(["lidar", "boxes"]),
    );
    const selection = selectMcap3dSceneSnapshot({
      current: sceneSnapshot(),
      currentRetainable: false,
      definitiveMissingGraceMs: GRACE_MS,
      empty: sceneSnapshot(),
      hasSourceData: true,
      held: restricted,
      key: KEY,
      nowMs: 0,
      readiness: "pending",
    });

    expect(restricted?.snapshot).toBe(snapshot);
    expect(selection.snapshot).toBe(snapshot);
    expect(selection.heldReason).toBe("pending");
  });

  it("removes a disabled source from a retained scene immediately", () => {
    const snapshot = sceneSnapshot({
      annotationTopics: ["boxes"],
      pointCloudTopics: ["lidar", "radar"],
    });

    const restricted = restrictHeldMcap3dSceneSnapshotToTopics(
      sceneHeld(snapshot),
      new Set(["radar", "boxes"]),
    );

    expect(
      restricted?.snapshot.pointCloudLayers.map((layer) => layer.id),
    ).toEqual(["radar"]);
    expect(
      restricted?.snapshot.annotationLayers.map((layer) => layer.sourceId),
    ).toEqual(["boxes"]);
    expect(restricted?.retainable).toBe(true);
  });

  it("marks a retained scene empty after its final source is disabled", () => {
    const restricted = restrictHeldMcap3dSceneSnapshotToTopics(
      sceneHeld(sceneSnapshot({ gridTopics: ["map"] })),
      new Set(),
    );

    expect(restricted?.snapshot.gridLayers).toEqual([]);
    expect(restricted?.retainable).toBe(false);
  });
});

function readyHeld(): HeldMcap3dSceneSnapshot<string> {
  return {
    definitiveMissingSinceMs: null,
    key: KEY,
    retainable: true,
    snapshot: READY,
  };
}

function sceneHeld(
  snapshot: Mcap3dSceneSnapshot,
): HeldMcap3dSceneSnapshot<Mcap3dSceneSnapshot> {
  return {
    definitiveMissingSinceMs: null,
    key: KEY,
    retainable: true,
    snapshot,
  };
}

function sceneSnapshot({
  annotationTopics = [],
  gridTopics = [],
  pointCloudTopics = [],
}: {
  readonly annotationTopics?: readonly string[];
  readonly gridTopics?: readonly string[];
  readonly pointCloudTopics?: readonly string[];
} = {}): Mcap3dSceneSnapshot {
  return {
    annotationLayers: annotationTopics.map(
      (sourceId) =>
        ({
          id: `${sourceId}:entity`,
          sourceId,
        }) as Mcap3dSceneSnapshot["annotationLayers"][number],
    ),
    frustumLayers: [],
    gridLayers: gridTopics.map(
      (id) => ({ id }) as Mcap3dSceneSnapshot["gridLayers"][number],
    ),
    notices: [],
    placementStatus: "transformed",
    pointCloudLayers: pointCloudTopics.map(
      (id) => ({ id }) as Mcap3dSceneSnapshot["pointCloudLayers"][number],
    ),
  };
}

function select({
  current = EMPTY,
  hasSourceData = true,
  held = null,
  key = KEY,
  nowMs = 0,
  readiness = "definitiveMissing",
}: {
  readonly current?: string;
  readonly hasSourceData?: boolean;
  readonly held?: HeldMcap3dSceneSnapshot<string> | null;
  readonly key?: string;
  readonly nowMs?: number;
  readonly readiness?: "ready" | "pending" | "definitiveMissing";
}) {
  return selectMcap3dSceneSnapshot({
    current,
    currentRetainable: current !== EMPTY,
    definitiveMissingGraceMs: GRACE_MS,
    empty: EMPTY,
    hasSourceData,
    held,
    key,
    nowMs,
    readiness,
  });
}
