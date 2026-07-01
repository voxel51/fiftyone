import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  dehydrateMcapFrameTransformSet,
  hydrateMcapFrameTransformSet,
  McapFrameTransformStore,
} from "./frame-transforms";
import type { McapFrameTransformSample } from "./frame-transform-types";

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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
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

describe("frame transform worker boundary serialization", () => {
  it("survives a structuredClone round-trip via dehydrate/hydrate", () => {
    // Models a real worker postMessage. The worker dehydrates THREE instances
    // before posting; structuredClone strips any leftover prototypes; the
    // receiver hydrates back to real THREE.
    const originalRotation = new Quaternion(0.1, 0.2, 0.3, 0.4).normalize();
    const set = {
      samples: [
        {
          childFrameId: "lidar",
          parentFrameId: "map",
          rotation: originalRotation,
          timeNs: 123n,
          translation: new Vector3(1, 2, 3),
        },
      ],
    };

    const dehydrated = dehydrateMcapFrameTransformSet(set);
    const overWire = structuredClone(dehydrated);
    const [received] = hydrateMcapFrameTransformSet(overWire).samples;
    if (!received) {
      throw new Error("Expected one hydrated sample");
    }

    expect(received.rotation).toBeInstanceOf(Quaternion);
    expect(received.translation).toBeInstanceOf(Vector3);
    expect(received.rotation.x).toBeCloseTo(originalRotation.x);
    expect(received.rotation.y).toBeCloseTo(originalRotation.y);
    expect(received.rotation.z).toBeCloseTo(originalRotation.z);
    expect(received.rotation.w).toBeCloseTo(originalRotation.w);
    expect(received.translation.toArray()).toEqual([1, 2, 3]);
    expect(received.timeNs).toBe(123n);
  });

  it("would lose Quaternion values without dehydration", () => {
    // Lock in the reason `dehydrateMcapFrameTransformSet` exists: structured
    // clone strips Quaternion's x/y/z/w accessors. Skipping dehydration on the
    // worker side yields zeroed rotations after hydrate. If this test ever
    // starts failing, THREE's Quaternion storage changed and the workaround is
    // worth revisiting.
    const set = {
      samples: [
        {
          childFrameId: "lidar",
          parentFrameId: "map",
          rotation: new Quaternion(0.1, 0.2, 0.3, 0.4).normalize(),
          translation: new Vector3(),
        },
      ],
    };

    const overWireWithoutDehydrate = structuredClone(set);
    const [received] = hydrateMcapFrameTransformSet(
      overWireWithoutDehydrate,
    ).samples;
    if (!received) {
      throw new Error("Expected one hydrated sample");
    }

    expect(received.rotation.x).toBe(0);
    expect(received.rotation.y).toBe(0);
    expect(received.rotation.z).toBe(0);
    expect(received.rotation.w).toBe(1);
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
  readonly dynamicSamples?: readonly McapFrameTransformSample[];
  readonly staticSamples?: readonly McapFrameTransformSample[];
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
  timeNs?: bigint,
): McapFrameTransformSample {
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
