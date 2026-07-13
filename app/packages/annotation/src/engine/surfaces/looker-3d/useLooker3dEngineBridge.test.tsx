// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeEngine } from "../../testing/fixtures";
import type { Working3dLabel } from "./adapters";
import type { WorkingStore3d } from "./looker3dBridge";
import { useLooker3dEngineBridge } from "./useLooker3dEngineBridge";

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

const data3d = {
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
};

describe("useLooker3dEngineBridge", () => {
  it("registers on mount (seeds the working store), clears on unmount", () => {
    const { engine } = makeEngine("sample-1", data3d);
    const { store, map } = makeFakeStore();

    const { unmount } = renderHook(() =>
      useLooker3dEngineBridge({
        engine,
        sample: "sample-1",
        store,
        resolveColor: () => "#x",
      }),
    );

    expect(map.get("c1")?.label).toBe("car");
    expect(map.get("c1")?.color).toBe("#x");

    unmount();
    expect(map.get("c1")).toBeUndefined();
  });

  it("is inert until the scene sample id settles (empty sample)", () => {
    const { engine } = makeEngine("sample-1", data3d);
    const { store, map } = makeFakeStore();

    renderHook(() => useLooker3dEngineBridge({ engine, sample: "", store }));

    expect(map.size).toBe(0);
  });
});
