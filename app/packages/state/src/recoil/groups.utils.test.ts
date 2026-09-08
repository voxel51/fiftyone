import type { ModalSample } from "./modal";
import { describe, expect, it } from "vitest";
import {
  areSlicesEqual,
  getGroupSampleMediaPath,
  getRepresentative3dSlice,
  normalizeActive3dSlices,
  resolveInteraction3dState,
  resolveNormalized3dSelection,
  resolvePinned3dSlice,
} from "./groups.utils";

const buildModalSample = ({
  id,
  filepath,
  urls,
}: {
  id: string;
  filepath: string;
  urls?: ModalSample["urls"];
}) => {
  return {
    id,
    sample: {
      _id: id,
      filepath,
    },
    urls,
  } as ModalSample;
};

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
    ]),
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
      }),
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
      }),
    ).toBe("pcd");
  });

  it("keeps at most one fo3d slice active and preserves direct slices", () => {
    expect(
      normalizeActive3dSlices({
        activeSlices: ["scene-a", "lidar", "scene-b"],
        preferredFo3dSlice: "scene-b",
        realFo3dSlices: ["scene-a", "scene-b"],
      }),
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
      }),
    ).toEqual({
      nextActive3dSlices: ["pcd"],
      nextPinnedSlice: "pcd",
    });
  });

  it("returns an empty normalized selection when no slices are available", () => {
    expect(
      resolveNormalized3dSelection({
        active3dSlices: [],
        all3dSlices: [],
        pinnedSlice: null,
        realFo3dSlices: ["fo3d"],
        samples: {},
      }),
    ).toEqual({
      nextActive3dSlices: [],
      nextPinnedSlice: null,
    });
  });

  it("falls back to the next available slice when the pinned slice is missing", () => {
    const samples = buildSamples({
      scene: "/tmp/scene.fo3d",
      lidar: "/tmp/lidar.pcd",
    });

    expect(
      resolvePinned3dSlice({
        active3dSlices: [],
        all3dSlices: ["missing", "lidar", "scene"],
        pinnedSlice: "missing",
        samples,
      }),
    ).toBe("lidar");

    expect(
      resolveNormalized3dSelection({
        active3dSlices: [],
        all3dSlices: ["missing", "lidar", "scene"],
        pinnedSlice: "missing",
        realFo3dSlices: ["scene"],
        samples,
      }),
    ).toEqual({
      nextActive3dSlices: ["lidar"],
      nextPinnedSlice: "lidar",
    });
  });

  it("prefers the valid pinned slice when choosing the representative 3d slice", () => {
    expect(
      getRepresentative3dSlice({
        activeSlices: ["scene-b", "scene-a"],
        sampleMap: buildSamples({
          "scene-a": "/tmp/scene-a.fo3d",
          "scene-b": "/tmp/scene-b.fo3d",
        }),
        pinnedSlice: "scene-a",
      }),
    ).toBe("scene-a");
  });

  it("falls back to the first active or available representative 3d slice", () => {
    const sampleMap = buildSamples({
      "scene-a": "/tmp/scene-a.fo3d",
      "scene-b": "/tmp/scene-b.fo3d",
    });

    expect(
      getRepresentative3dSlice({
        activeSlices: ["scene-b", "scene-a"],
        sampleMap,
        pinnedSlice: "missing",
      }),
    ).toBe("scene-b");

    expect(
      getRepresentative3dSlice({
        activeSlices: [],
        sampleMap,
        pinnedSlice: "missing",
      }),
    ).toBe("scene-a");
  });

  it("uses the active grouped sample map and pinned representative for interactions", () => {
    const modalSample = buildModalSample({
      id: "modal",
      filepath: "/tmp/modal.png",
    });
    const activeSampleMap = {
      scene: buildModalSample({
        id: "scene",
        filepath: "/tmp/scene.fo3d",
      }),
      lidar: buildModalSample({
        id: "lidar",
        filepath: "/tmp/lidar.pcd",
      }),
    };

    expect(
      resolveInteraction3dState({
        isGroup: true,
        modalSample,
        activeSlices: ["scene", "lidar"],
        activeSampleMap,
        allSampleMap: {
          ...activeSampleMap,
          extra: buildModalSample({
            id: "extra",
            filepath: "/tmp/extra.pcd",
          }),
        },
        pinnedSlice: "lidar",
      }),
    ).toEqual({
      sampleMap: activeSampleMap,
      representativeSlice: "lidar",
      representativeSample: activeSampleMap.lidar,
    });
  });

  it("falls back to the modal sample for non-group interaction state", () => {
    const modalSample = buildModalSample({
      id: "modal",
      filepath: "/tmp/modal.png",
    });

    expect(
      resolveInteraction3dState({
        isGroup: false,
        modalSample,
        activeSlices: ["scene"],
        activeSampleMap: buildSamples({
          scene: "/tmp/scene.fo3d",
        }),
        allSampleMap: buildSamples({
          scene: "/tmp/scene.fo3d",
        }),
        pinnedSlice: "scene",
      }),
    ).toEqual({
      sampleMap: { default: modalSample },
      representativeSlice: null,
      representativeSample: modalSample,
    });
  });

  it("resolves grouped media paths from array and object url maps", () => {
    expect(
      getGroupSampleMediaPath(
        buildModalSample({
          id: "array-sample",
          filepath: "/tmp/filepath.png",
          urls: [
            { field: "thumbnail_path", url: "/tmp/thumb.png" },
            { field: "filepath", url: "/tmp/file.png" },
          ],
        }),
        "filepath",
      ),
    ).toBe("/tmp/file.png");

    expect(
      getGroupSampleMediaPath(
        buildModalSample({
          id: "object-sample",
          filepath: "/tmp/filepath.png",
          urls: {
            filepath: "/tmp/file.png",
            thumbnail_path: "/tmp/thumb.png",
          },
        }),
        "thumbnail_path",
      ),
    ).toBe("/tmp/thumb.png");
  });
});
