import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { McapFrameTransformStore } from "./frame-transforms";
import type { McapHydratedFrameTransformSample } from "./types";

describe("MCAP frame transform store", () => {
  it("resolves static-only frame paths", () => {
    const store = createStore({
      staticSamples: [sample("map", "lidar", { x: 1, y: 2, z: 3 })],
    });

    expect(
      store.resolve({
        sourceFrameId: "lidar",
        targetFrameId: "map",
        timeNs: 10n,
      })
    ).toMatchObject({
      sourceFrameId: "lidar",
      status: "resolved",
      targetFrameId: "map",
      transform: {
        sourceFrameId: "lidar",
        targetFrameId: "map",
        translation: { x: 1, y: 2, z: 3 },
      },
    });
  });

  it("uses the latest dynamic sample at or before playback time", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n),
        sample("map", "base_link", { x: 2, y: 0, z: 0 }, 200n),
        sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n),
      ],
    });

    expect(
      store.resolve({
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 250n,
      })
    ).toMatchObject({
      status: "resolved",
      transform: {
        translation: { x: 2, y: 0, z: 0 },
      },
    });
  });

  it("does not use future dynamic samples", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n)],
    });

    expect(
      store.resolve({
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 250n,
      })
    ).toMatchObject({
      status: "missing",
    });
  });

  it("composes mixed static and dynamic paths", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 200n, startTimeNs: 0n },
      dynamicSamples: [sample("map", "base_link", { x: 10, y: 0, z: 0 }, 100n)],
      staticSamples: [sample("base_link", "lidar", { x: 0, y: 2, z: 0 })],
    });

    expect(
      store.resolve({
        sourceFrameId: "lidar",
        targetFrameId: "map",
        timeNs: 150n,
      })
    ).toMatchObject({
      status: "resolved",
      transform: {
        translation: { x: 10, y: 2, z: 0 },
      },
    });
  });

  it("resolves inverse paths", () => {
    const store = createStore({
      staticSamples: [sample("map", "lidar", { x: 1, y: 2, z: 3 })],
    });

    expect(
      store.resolve({
        sourceFrameId: "map",
        targetFrameId: "lidar",
        timeNs: 10n,
      })
    ).toMatchObject({
      status: "resolved",
      transform: {
        translation: { x: -1, y: -2, z: -3 },
      },
    });
  });

  it("reports pending before a dynamic range has been indexed", () => {
    const store = createStore({
      staticSamples: [sample("base_link", "lidar")],
    });

    expect(
      store.resolve({
        sourceFrameId: "lidar",
        targetFrameId: "map",
        timeNs: 10n,
      })
    ).toEqual({
      sourceFrameId: "lidar",
      status: "pending",
      targetFrameId: "map",
    });
  });

  it("reports missing once the dynamic range has been indexed without a path", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 20n, startTimeNs: 0n },
      staticSamples: [sample("base_link", "lidar")],
    });

    expect(
      store.resolve({
        sourceFrameId: "lidar",
        targetFrameId: "map",
        timeNs: 10n,
      })
    ).toEqual({
      sourceFrameId: "lidar",
      status: "missing",
      targetFrameId: "map",
    });
  });

  it("tracks known frame ids from loaded samples", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 20n, startTimeNs: 0n },
      dynamicSamples: [sample("map", "base_link", undefined, 10n)],
      staticSamples: [
        sample("base_link", "camera"),
        sample("base_link", "lidar"),
      ],
    });

    expect(store.frameIds()).toEqual(["base_link", "camera", "lidar", "map"]);
  });
});

function createStore({
  dynamicRange,
  dynamicSamples = [],
  staticSamples = [],
}: {
  readonly dynamicRange?: {
    readonly endTimeNs: bigint;
    readonly startTimeNs: bigint;
  };
  readonly dynamicSamples?: readonly McapHydratedFrameTransformSample[];
  readonly staticSamples?: readonly McapHydratedFrameTransformSample[];
}) {
  const store = new McapFrameTransformStore();
  store.addStatic(staticSamples);
  if (dynamicRange) {
    store.addDynamic(dynamicSamples, dynamicRange);
  }

  return store;
}

function sample(
  parentFrameId: string,
  childFrameId: string,
  translation:
    | Vector3
    | {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      } = new Vector3(),
  timeNs?: bigint
): McapHydratedFrameTransformSample {
  return {
    childFrameId,
    parentFrameId,
    rotation: new Quaternion(),
    ...(timeNs !== undefined ? { timeNs } : {}),
    translation:
      translation instanceof Vector3
        ? translation
        : new Vector3(translation.x, translation.y, translation.z),
  };
}
