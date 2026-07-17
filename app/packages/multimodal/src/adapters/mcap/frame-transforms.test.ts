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

  it("interpolates dynamic samples around playback time", () => {
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
      maxInterpolationGapNs: 100n,
      status: "resolved",
      transform: {
        maxInterpolationGapNs: 100n,
        resolutionKind: "interpolated",
        translation: { x: 2.5, y: 0, z: 0 },
      },
    });
  });

  it("holds the latest at-or-before sample in hold-last mode", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n),
        sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n),
      ],
    });

    expect(
      store.resolve({
        policy: {
          boundaryClampNs: 50n,
          maxInterpolationGapNs: 0n,
          resolutionMode: "hold-last",
        },
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 250n,
      }),
    ).toMatchObject({
      resolutionKind: "held",
      status: "resolved",
      transform: {
        resolutionKind: "held",
        translation: { x: 1, y: 0, z: 0 },
      },
    });
  });

  it("still resolves exact samples and start clamps in hold-last mode", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n),
        sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n),
      ],
    });
    const policy = {
      boundaryClampNs: 50n,
      maxInterpolationGapNs: 0n,
      resolutionMode: "hold-last",
    } as const;

    expect(
      store.resolve({
        policy,
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 100n,
      }),
    ).toMatchObject({
      resolutionKind: "exact",
      status: "resolved",
      transform: { translation: { x: 1, y: 0, z: 0 } },
    });

    expect(
      store.resolve({
        policy,
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 60n,
      }),
    ).toMatchObject({
      resolutionKind: "clamped",
      status: "resolved",
      transform: { translation: { x: 1, y: 0, z: 0 } },
    });
  });

  it("carries the largest interpolation gap through composed paths", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n),
        sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n),
      ],
      staticSamples: [sample("base_link", "lidar", { x: 0, y: 2, z: 0 })],
    });

    expect(
      store.resolve({
        sourceFrameId: "lidar",
        targetFrameId: "map",
        timeNs: 200n,
      }),
    ).toMatchObject({
      maxInterpolationGapNs: 200n,
      status: "resolved",
      transform: {
        maxInterpolationGapNs: 200n,
        translation: { x: 2, y: 2, z: 0 },
      },
    });
  });

  it("slerps dynamic rotations around playback time", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", undefined, 100n, new Quaternion()),
        sample(
          "map",
          "base_link",
          undefined,
          300n,
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI),
        ),
      ],
    });

    const resolution = store.resolve({
      sourceFrameId: "base_link",
      targetFrameId: "map",
      timeNs: 200n,
    });
    if (resolution.status !== "resolved") {
      throw new Error("Expected resolved transform");
    }

    const rotated = new Vector3(1, 0, 0).applyQuaternion(
      resolution.transform.rotation,
    );
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(1);
  });

  it("clamps the start boundary within tolerance", () => {
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
      resolutionKind: "clamped",
      status: "resolved",
      transform: {
        translation: { x: 3, y: 0, z: 0 },
      },
    });
  });

  it("reports missing beyond the boundary clamp tolerance", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 300n, startTimeNs: 0n },
      dynamicSamples: [sample("map", "base_link", { x: 3, y: 0, z: 0 }, 300n)],
    });

    expect(
      store.resolve({
        policy: {
          boundaryClampNs: 10n,
          maxInterpolationGapNs: 250n,
        },
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 250n,
      }),
    ).toMatchObject({
      status: "missing",
    });
  });

  it("reports missing across interpolation gaps larger than the policy allows", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 1000n, startTimeNs: 0n },
      dynamicSamples: [
        sample("map", "base_link", { x: 1, y: 0, z: 0 }, 100n),
        sample("map", "base_link", { x: 10, y: 0, z: 0 }, 1000n),
      ],
    });

    expect(
      store.resolve({
        policy: {
          boundaryClampNs: 50n,
          maxInterpolationGapNs: 100n,
        },
        sourceFrameId: "base_link",
        targetFrameId: "map",
        timeNs: 500n,
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

  it("exposes merged indexed dynamic ranges", () => {
    const store = new McapFrameTransformStore();
    store.addDynamic([], { endTimeNs: 20n, startTimeNs: 10n });
    store.addDynamic([], { endTimeNs: 40n, startTimeNs: 20n });
    store.addDynamic([], { endTimeNs: 70n, startTimeNs: 60n });

    expect(store.indexedRanges()).toEqual([
      { endTimeNs: 40n, startTimeNs: 10n },
      { endTimeNs: 70n, startTimeNs: 60n },
    ]);
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

  it("summarizes a single tree root and directed reachability", () => {
    const store = createStore({
      staticSamples: [
        sample("map", "base_link"),
        sample("base_link", "camera"),
        sample("base_link", "lidar"),
      ],
    });

    const summary = store.summarizeGraph(new Set(["camera", "lidar"]));

    expect(summary.roots).toEqual(["map"]);
    expect(summary.tfConnectedFrameIds).toEqual([
      "base_link",
      "camera",
      "lidar",
      "map",
    ]);
    expect(counts(summary.reachableCountsByFrameId)).toEqual({
      base_link: 3,
      camera: 1,
      lidar: 1,
      map: 4,
    });
    expect(counts(summary.dataBearingReachableCountsByFrameId)).toEqual({
      base_link: 2,
      camera: 1,
      lidar: 1,
      map: 2,
    });
  });

  it("summarizes forest roots independently", () => {
    const store = createStore({
      staticSamples: [sample("map", "base_link"), sample("odom", "wheel")],
    });

    const summary = store.summarizeGraph(new Set(["base_link", "wheel"]));

    expect(summary.roots).toEqual(["map", "odom"]);
    expect(summary.components).toEqual([
      ["base_link", "map"],
      ["odom", "wheel"],
    ]);
    expect(summary.tfConnectedFrameIds).toEqual([
      "base_link",
      "map",
      "odom",
      "wheel",
    ]);
    expect(counts(summary.dataBearingReachableCountsByFrameId)).toEqual({
      base_link: 1,
      map: 1,
      odom: 1,
      wheel: 1,
    });
  });

  it("changes topology revision only when a new transform edge appears", () => {
    const store = new McapFrameTransformStore();
    expect(store.topologyRevision()).toBe(0);

    store.addDynamic([sample("map", "base_link", { x: 0, y: 0, z: 0 }, 10n)], {
      endTimeNs: 10n,
      startTimeNs: 10n,
    });
    expect(store.topologyRevision()).toBe(1);

    store.addDynamic([sample("map", "base_link", { x: 1, y: 0, z: 0 }, 20n)], {
      endTimeNs: 20n,
      startTimeNs: 20n,
    });
    store.addStatic([sample("map", "base_link", { x: 0, y: 0, z: 0 })]);
    expect(store.topologyRevision()).toBe(1);

    store.addStatic([sample("base_link", "lidar", { x: 0, y: 0, z: 0 })]);
    expect(store.topologyRevision()).toBe(2);
  });

  it("falls back deterministically when every frame is in a cycle", () => {
    const store = createStore({
      staticSamples: [
        sample("cycle_b", "cycle_c"),
        sample("cycle_c", "cycle_a"),
        sample("cycle_a", "cycle_b"),
      ],
    });

    const summary = store.summarizeGraph(new Set(["cycle_c"]));

    expect(summary.roots).toEqual([]);
    expect(summary.tfConnectedFrameIds).toEqual([
      "cycle_a",
      "cycle_b",
      "cycle_c",
    ]);
    expect(counts(summary.reachableCountsByFrameId)).toEqual({
      cycle_a: 3,
      cycle_b: 3,
      cycle_c: 3,
    });
  });

  it("summarizes dynamic-only edges", () => {
    const store = createStore({
      dynamicRange: { endTimeNs: 30n, startTimeNs: 0n },
      dynamicSamples: [
        sample("world", "base_link", undefined, 10n),
        sample("base_link", "lidar", undefined, 20n),
      ],
    });

    const summary = store.summarizeGraph(new Set(["lidar"]));

    expect(summary.roots).toEqual(["world"]);
    expect(summary.tfConnectedFrameIds).toEqual([
      "base_link",
      "lidar",
      "world",
    ]);
    expect(counts(summary.dataBearingReachableCountsByFrameId)).toMatchObject({
      base_link: 1,
      world: 1,
    });
  });

  it("counts data-bearing reachability for root ranking", () => {
    const store = createStore({
      staticSamples: [
        sample("map", "base_link"),
        sample("base_link", "camera"),
        sample("base_link", "lidar"),
        sample("odom", "wheel"),
      ],
    });

    const summary = store.summarizeGraph(new Set(["camera", "lidar", "wheel"]));

    expect(summary.roots).toEqual(["map", "odom"]);
    expect(counts(summary.dataBearingReachableCountsByFrameId)).toMatchObject({
      map: 2,
      odom: 1,
    });
    expect(counts(summary.reachableCountsByFrameId)).toMatchObject({
      map: 4,
      odom: 2,
    });
  });

  it("sorts graph summary ids by codepoint for deterministic tie-breaks", () => {
    const store = createStore({
      staticSamples: [
        sample("z_root", "z_child"),
        sample("A_root", "A_child"),
        sample("a_root", "a_child"),
      ],
    });

    const summary = store.summarizeGraph(new Set());

    expect(summary.roots).toEqual(["A_root", "a_root", "z_root"]);
    expect(summary.tfConnectedFrameIds).toEqual([
      "A_child",
      "A_root",
      "a_child",
      "a_root",
      "z_child",
      "z_root",
    ]);
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
  rotation = new Quaternion(),
): McapFrameTransformSample {
  return {
    childFrameId,
    parentFrameId,
    rotation,
    ...(timeNs !== undefined ? { timeNs } : {}),
    translation:
      translation instanceof Vector3
        ? translation
        : new Vector3(translation.x, translation.y, translation.z),
  };
}

function counts(countsByFrameId: ReadonlyMap<string, number>) {
  return Object.fromEntries([...countsByFrameId.entries()]);
}
