import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  restrictHeldScene3dSnapshotToStreams,
  useScene3dSnapshot,
  type Scene3dSnapshot,
} from "./use-scene-3d-snapshot";
import type { HeldScene3dSnapshot } from "./scene-3d-scene-snapshot";

describe("useScene3dSnapshot", () => {
  it("retains the committed scene while the same source is pending", () => {
    const ready = snapshot([{ id: "cloud" }] as never);
    const empty = snapshot([]);
    const { result, rerender } = renderHook<
      ReturnType<typeof useScene3dSnapshot>,
      { current: Scene3dSnapshot; readiness: "pending" | "ready" }
    >(
      ({ current, readiness }) =>
        useScene3dSnapshot({
          current,
          hasSourceData: true,
          key: "source:selection:world",
          readiness,
          selectedStreams: ["cloud"],
        }),
      { initialProps: { current: ready, readiness: "ready" as const } },
    );

    expect(result.current.snapshot).toBe(ready);
    rerender({ current: empty, readiness: "pending" as const });
    expect(result.current.snapshot).toBe(ready);
    expect(result.current.heldReason).toBe("pending");
  });
});

describe("restrictHeldScene3dSnapshotToStreams", () => {
  it("retains an existing scene while an additive source is pending", () => {
    const current = sceneSnapshot({ pointCloudStreams: ["lidar"] });
    const held = heldSnapshot(current);

    const restricted = restrictHeldScene3dSnapshotToStreams(
      held,
      new Set(["lidar", "boxes"]),
    );

    expect(restricted?.snapshot).toBe(current);
    expect(restricted?.retainable).toBe(true);
  });

  it("removes disabled source state from a retained scene immediately", () => {
    const current = sceneSnapshot({
      annotationStreams: ["boxes"],
      frustumStreams: ["camera", "rear-camera"],
      notices: [
        {
          id: "global",
          message: "Global notice",
          scope: "scene",
          severity: "info",
        },
        {
          id: "camera",
          message: "Camera notice",
          scope: "stream",
          severity: "warning",
          streamId: "camera",
        },
        {
          id: "lidar",
          message: "Lidar notice",
          scope: "stream",
          severity: "warning",
          streamId: "lidar",
        },
      ],
      pointCloudStreams: ["lidar", "radar"],
    });

    const restricted = restrictHeldScene3dSnapshotToStreams(
      heldSnapshot(current),
      new Set(["radar", "boxes", "camera"]),
    );

    expect(
      restricted?.snapshot.pointCloudLayers.map((layer) => layer.id),
    ).toEqual(["radar"]);
    expect(
      restricted?.snapshot.annotationLayers.map((layer) => layer.sourceId),
    ).toEqual(["boxes"]);
    expect(restricted?.snapshot.frustumLayers.map((layer) => layer.id)).toEqual(
      ["camera"],
    );
    expect(restricted?.snapshot.notices.map((notice) => notice.id)).toEqual([
      "global",
      "camera",
    ]);
    expect(restricted?.retainable).toBe(true);
  });

  it("marks a retained scene empty after its final source is disabled", () => {
    const restricted = restrictHeldScene3dSnapshotToStreams(
      heldSnapshot(sceneSnapshot({ gridStreams: ["map"] })),
      new Set(),
    );

    expect(restricted?.snapshot.gridLayers).toEqual([]);
    expect(restricted?.retainable).toBe(false);
  });
});

function snapshot(
  pointCloudLayers: Scene3dSnapshot["pointCloudLayers"],
): Scene3dSnapshot {
  return {
    annotationLayers: [],
    frustumLayers: [],
    gridLayers: [],
    notices: [],
    placementStatus: pointCloudLayers.length > 0 ? "transformed" : "empty",
    pointCloudLayers,
  };
}

function heldSnapshot(
  current: Scene3dSnapshot,
): HeldScene3dSnapshot<Scene3dSnapshot> {
  return {
    definitiveMissingSinceMs: null,
    key: "source:world",
    retainable: true,
    snapshot: current,
  };
}

function sceneSnapshot({
  annotationStreams = [],
  frustumStreams = [],
  gridStreams = [],
  notices = [],
  pointCloudStreams = [],
}: {
  readonly annotationStreams?: readonly string[];
  readonly frustumStreams?: readonly string[];
  readonly gridStreams?: readonly string[];
  readonly notices?: Scene3dSnapshot["notices"];
  readonly pointCloudStreams?: readonly string[];
} = {}): Scene3dSnapshot {
  return {
    annotationLayers: annotationStreams.map(
      (sourceId) =>
        ({
          id: `${sourceId}:entity`,
          sourceId,
        }) as Scene3dSnapshot["annotationLayers"][number],
    ),
    frustumLayers: frustumStreams.map(
      (id) => ({ id }) as Scene3dSnapshot["frustumLayers"][number],
    ),
    gridLayers: gridStreams.map(
      (id) => ({ id }) as Scene3dSnapshot["gridLayers"][number],
    ),
    notices,
    placementStatus: "transformed",
    pointCloudLayers: pointCloudStreams.map(
      (id) => ({ id }) as Scene3dSnapshot["pointCloudLayers"][number],
    ),
  };
}
