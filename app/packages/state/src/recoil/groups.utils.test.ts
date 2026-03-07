import type { ModalSample } from "./modal";
import { describe, expect, it } from "vitest";
import {
  areSlicesEqual,
  normalizeActive3dSlices,
  resolveNormalized3dSelection,
  resolvePinned3dSlice,
} from "./groups.utils";

const buildSamples = (paths: Record<string, string>) => {
  return Object.fromEntries(
    Object.entries(paths).map(([slice, filepath]) => [
      slice,
      {
        sample: {
          _id: `${slice}-id`,
          filepath,
        },
      },
    ])
  ) as Record<string, ModalSample>;
};

describe("groups.utils", () => {
  it("compares slice arrays by content and order", () => {
    expect(areSlicesEqual(["fo3d", "lidar"], ["fo3d", "lidar"])).toBe(true);
    expect(areSlicesEqual(["fo3d", "lidar"], ["lidar", "fo3d"])).toBe(false);
  });

  it("promotes the next active slice when the pinned slice was deselected", () => {
    expect(
      resolvePinned3dSlice({
        active3dSlices: ["pcd-right", "pcd-top"],
        all3dSlices: ["pcd-left", "pcd-right", "pcd-top"],
        pinnedSlice: "pcd-left",
        samples: buildSamples({
          "pcd-left": "/tmp/left.pcd",
          "pcd-right": "/tmp/right.pcd",
          "pcd-top": "/tmp/top.pcd",
        }),
      })
    ).toBe("pcd-right");
  });

  it("keeps the pinned slice as the reopen fallback when no active slices exist", () => {
    expect(
      resolvePinned3dSlice({
        active3dSlices: [],
        all3dSlices: ["fo3d", "pcd"],
        pinnedSlice: "pcd",
        samples: buildSamples({
          fo3d: "/tmp/scene.fo3d",
          pcd: "/tmp/lidar.pcd",
        }),
      })
    ).toBe("pcd");
  });

  it("keeps at most one fo3d slice active and preserves direct slices", () => {
    expect(
      normalizeActive3dSlices({
        activeSlices: ["scene-a", "lidar", "scene-b"],
        preferredFo3dSlice: "scene-b",
        realFo3dSlices: ["scene-a", "scene-b"],
      })
    ).toEqual(["lidar", "scene-b"]);
  });

  it("rebuilds a valid selection from available slices", () => {
    expect(
      resolveNormalized3dSelection({
        active3dSlices: [],
        all3dSlices: ["fo3d", "pcd"],
        pinnedSlice: "pcd",
        realFo3dSlices: ["fo3d"],
        samples: buildSamples({
          fo3d: "/tmp/scene.fo3d",
          pcd: "/tmp/lidar.pcd",
        }),
      })
    ).toEqual({
      nextActive3dSlices: ["pcd"],
      nextPinnedSlice: "pcd",
    });
  });
});
