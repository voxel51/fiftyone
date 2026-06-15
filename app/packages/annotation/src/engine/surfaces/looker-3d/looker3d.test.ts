import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeEngine, ref } from "../../testing/fixtures";
import {
  detection3dAdapter,
  looker3dAdapters,
  polyline3dAdapter,
  type Looker3dHandle,
  type Working3dLabel,
} from "./adapters";
import { createLooker3dBridge, type WorkingStore3d } from "./looker3dBridge";

// build3dLabel is the only runtime cross-package import the adapters pull in;
// it touches looker-3d types only, so no mock is needed.

const cuboid = (id: string, label = "car"): Working3dLabel =>
  ({
    _id: id,
    _cls: "Detection",
    type: "Detection",
    path: "ground_truth",
    label,
    location: [1, 2, 3],
    dimensions: [4, 5, 6],
    rotation: [0, 0, 0],
    color: "#seed",
    isNew: false,
    sampleId: "sample-1",
    tags: [],
  } as unknown as Working3dLabel);

/** In-memory working store standing in for the Recoil-backed implementation. */
const makeFakeStore = () => {
  const map = new Map<string, Working3dLabel>();
  const store: WorkingStore3d = {
    get: (id) => map.get(id),
    add: (label) => {
      map.set(label._id, label);
    },
    update: (id, partial) => {
      const prev = map.get(id);
      if (prev) {
        map.set(id, { ...prev, ...partial } as Working3dLabel);
      }
    },
    remove: (id) => {
      map.delete(id);
    },
  };
  return { store, map };
};

describe("looker-3d adapters", () => {
  describe("renders (content scope)", () => {
    it("a detection renders only with a 3D location + dimensions", () => {
      expect(
        detection3dAdapter.renders?.({
          location: [1, 2, 3],
          dimensions: [4, 5, 6],
        } as never)
      ).toBe(true);
      // a 2D detection (bounding box, no 3D geometry) is out of scope
      expect(
        detection3dAdapter.renders?.({ bounding_box: [0, 0, 1, 1] } as never)
      ).toBe(false);
      // box-less / geometry-less junk
      expect(detection3dAdapter.renders?.({ label: "car" } as never)).toBe(
        false
      );
    });

    it("a polyline renders only with 3D points", () => {
      expect(
        polyline3dAdapter.renders?.({ points3d: [[[0, 0, 0]]] } as never)
      ).toBe(true);
      // a 2D polyline (`points`, no `points3d`) is out of scope
      expect(polyline3dAdapter.renders?.({ points: [[[0, 0]]] } as never)).toBe(
        false
      );
      expect(polyline3dAdapter.renders?.({ points3d: [] } as never)).toBe(
        false
      );
    });
  });

  it("buildHandle stamps id = ref.instanceId, path, type, and clears isNew", () => {
    const descriptor = detection3dAdapter.buildHandle(
      ref("ground_truth", "c1"),
      {
        _id: "stale",
        _cls: "Detection",
        label: "car",
        location: [1, 2, 3],
        dimensions: [4, 5, 6],
      } as never
    );

    expect(descriptor.label._id).toBe("c1");
    expect(descriptor.label.path).toBe("ground_truth");
    expect(descriptor.label.type).toBe("Detection");
    expect(descriptor.label.isNew).toBe(false);
  });

  describe("toLabel", () => {
    it("strips _id and the internal-only attributes", () => {
      const handle: Looker3dHandle = {
        instanceId: "c1",
        path: "ground_truth",
        read: () => cuboid("c1"),
        apply: vi.fn(),
      };

      const out = detection3dAdapter.toLabel(handle) as Record<string, unknown>;

      expect(out._id).toBeUndefined();
      expect(out.color).toBeUndefined();
      expect(out.path).toBeUndefined();
      expect(out.type).toBeUndefined();
      expect(out.isNew).toBeUndefined();
      expect(out.sampleId).toBeUndefined();
      // persistable geometry survives
      expect(out.location).toEqual([1, 2, 3]);
      expect(out.dimensions).toEqual([4, 5, 6]);
      expect(out.label).toBe("car");
    });

    it("returns null when the handle no longer resolves", () => {
      const handle: Looker3dHandle = {
        instanceId: "gone",
        path: "ground_truth",
        read: () => undefined,
        apply: vi.fn(),
      };
      expect(detection3dAdapter.toLabel(handle)).toBeNull();
    });
  });
});

describe("createLooker3dBridge", () => {
  it("mount stamps color from resolveColor and inserts into the store", () => {
    const { store, map } = makeFakeStore();
    const bridge = createLooker3dBridge({
      sample: "sample-1",
      store,
      resolveColor: () => "#resolved",
    });

    const handle = bridge.mount({
      label: { ...cuboid("c1"), color: undefined } as Working3dLabel,
    });

    expect(handle?.instanceId).toBe("c1");
    expect(map.get("c1")?.color).toBe("#resolved");
    expect(handle?.read()?.label).toBe("car");
  });

  it("mount falls back to the descriptor color when no resolver is given", () => {
    const { store, map } = makeFakeStore();
    const bridge = createLooker3dBridge({ sample: "sample-1", store });

    bridge.mount({ label: cuboid("c1") });

    expect(map.get("c1")?.color).toBe("#seed");
  });

  it("resolveHandle returns undefined on a path mismatch, adopts a matching entry", () => {
    const { store } = makeFakeStore();
    store.add(cuboid("c1"));
    const bridge = createLooker3dBridge({ sample: "sample-1", store });

    expect(bridge.resolveHandle(ref("predictions", "c1"))).toBeUndefined();
    expect(
      bridge.resolveHandle(ref("ground_truth", "missing"))
    ).toBeUndefined();

    const handle = bridge.resolveHandle(ref("ground_truth", "c1"));
    expect(handle?.instanceId).toBe("c1");

    // adoption: clear() now reaches the resolved entry
    bridge.clear();
    expect(store.get("c1")).toBeUndefined();
  });

  it("updateHandle merge-writes through the store; unmount removes", () => {
    const { store, map } = makeFakeStore();
    const bridge = createLooker3dBridge({ sample: "sample-1", store });
    const handle = bridge.mount({ label: cuboid("c1") })!;

    detection3dAdapter.updateHandle(handle, {
      label: "truck",
      location: [9, 9, 9],
    } as never);
    expect(map.get("c1")?.label).toBe("truck");
    expect(map.get("c1")?.location).toEqual([9, 9, 9]);

    bridge.unmount(handle);
    expect(store.get("c1")).toBeUndefined();
  });

  it("clear removes only managed entries, leaving un-adopted ones in place", () => {
    const { store } = makeFakeStore();
    store.add(cuboid("foreign")); // present but never touched by the bridge
    const bridge = createLooker3dBridge({ sample: "sample-1", store });

    bridge.mount({ label: cuboid("mine") });
    bridge.clear();

    expect(store.get("mine")).toBeUndefined();
    expect(store.get("foreign")).toBeDefined();
  });
});

describe("looker-3d bridge driven by the engine read-half", () => {
  let env: ReturnType<typeof makeEngine>;
  let fake: ReturnType<typeof makeFakeStore>;
  let unregister: () => void;

  beforeEach(() => {
    env = makeEngine("sample-1", {
      ground_truth: {
        _cls: "Detections",
        detections: [
          {
            _id: "c1",
            _cls: "Detection",
            label: "car",
            location: [1, 2, 3],
            dimensions: [4, 5, 6],
            rotation: [0, 0, 0],
          },
        ],
      },
    });
    fake = makeFakeStore();
    const bridge = createLooker3dBridge({
      sample: "sample-1",
      store: fake.store,
      resolveColor: () => "#engine",
    });
    unregister = env.engine.registerBridge(bridge, looker3dAdapters);
  });

  it("mounts present 3D labels into the working store on registration", () => {
    expect(fake.map.get("c1")?.label).toBe("car");
    expect(fake.map.get("c1")?.color).toBe("#engine");
  });

  it("reprojects a Sample edit onto the working entry", () => {
    env.sample.updateLabel("ground_truth", {
      _id: "c1",
      _cls: "Detection",
      label: "truck",
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    });

    expect(fake.map.get("c1")?.label).toBe("truck");
  });

  it("unmounts a working entry when its Sample label is deleted", () => {
    env.sample.deleteLabel("ground_truth", "c1");
    expect(fake.map.get("c1")).toBeUndefined();
  });

  it("stops reprojecting after unregister (clear() is the wiring hook's job)", () => {
    unregister();
    env.sample.updateLabel("ground_truth", {
      _id: "c1",
      _cls: "Detection",
      label: "stale",
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    });

    expect(fake.map.get("c1")?.label).toBe("car");
  });
});
