import { describe, expect, it } from "vitest";

import type {
  SceneEntityVisualization,
  SceneUpdateVisualization,
} from "../../../../ir/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import { sceneUpdateSnapshotAt } from "./scene-update-state";

describe("sceneUpdateSnapshotAt", () => {
  it("upserts scene entities by id", () => {
    const snapshot = sceneUpdateSnapshotAt(
      [
        updateDelta(10n, [entity("box", { label: "old" })]),
        updateDelta(20n, [entity("box", { label: "new" })]),
      ],
      20n,
    );

    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.metadata.label).toBe("new");
  });

  it("sorts deltas before folding", () => {
    const snapshot = sceneUpdateSnapshotAt(
      [
        updateDelta(20n, [entity("box", { label: "new" })]),
        updateDelta(10n, [entity("box", { label: "old" })]),
      ],
      20n,
    );

    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.metadata.label).toBe("new");
  });

  it("applies matching and all-entity deletions before upserts", () => {
    const snapshot = sceneUpdateSnapshotAt(
      [
        updateDelta(10n, [entity("old"), entity("kept")]),
        {
          timeNs: 20n,
          update: {
            deletions: [
              { id: "old", type: "matching-id" },
              { id: "", type: "all" },
            ],
            entities: [entity("replacement")],
            kind: VISUALIZATION_KIND.SCENE_UPDATE,
          },
        },
      ],
      20n,
    );

    expect(snapshot.entities.map((e) => e.id)).toEqual(["replacement"]);
  });

  it("skips deletions whose own timestamp is after the playhead", () => {
    const snapshot = sceneUpdateSnapshotAt(
      [
        updateDelta(10n, [entity("kept")]),
        {
          timeNs: 20n,
          update: {
            deletions: [{ id: "kept", timestampNs: 30n, type: "matching-id" }],
            entities: [],
            kind: VISUALIZATION_KIND.SCENE_UPDATE,
          },
        },
      ],
      20n,
    );

    expect(snapshot.entities.map((e) => e.id)).toEqual(["kept"]);
  });

  it("expires entity lifetimes relative to entity timestamps", () => {
    const beforeExpiry = sceneUpdateSnapshotAt(
      [updateDelta(10n, [entity("short", {}, 10n, 5n)])],
      14n,
    );
    const afterExpiry = sceneUpdateSnapshotAt(
      [updateDelta(10n, [entity("short", {}, 10n, 5n)])],
      15n,
    );

    expect(beforeExpiry.entities.map((e) => e.id)).toEqual(["short"]);
    expect(afterExpiry.entities).toEqual([]);
  });
});

function updateDelta(
  timeNs: bigint,
  entities: readonly SceneEntityVisualization[],
) {
  return {
    timeNs,
    update: {
      deletions: [],
      entities,
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
    } satisfies SceneUpdateVisualization,
  };
}

function entity(
  id: string,
  metadata: Readonly<Record<string, string>> = {},
  timestampNs?: bigint,
  lifetimeNs?: bigint,
): SceneEntityVisualization {
  return {
    arrowCount: 0,
    arrows: [],
    cubeCount: 0,
    cubes: [],
    cylinderCount: 0,
    cylinders: [],
    frameLocked: false,
    id,
    lineCount: 0,
    lines: [],
    ...(lifetimeNs !== undefined ? { lifetimeNs } : {}),
    metadata,
    modelCount: 0,
    models: [],
    sphereCount: 0,
    spheres: [],
    textCount: 0,
    texts: [],
    ...(timestampNs !== undefined ? { timestampNs } : {}),
    triangleCount: 0,
    triangles: [],
  };
}
