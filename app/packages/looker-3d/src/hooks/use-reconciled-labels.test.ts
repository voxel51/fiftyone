import { renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CuboidTransformData,
  PolylinePointTransformData,
} from "../annotation/types";
import type { OverlayLabel } from "../labels/loader";
import { useReconciledLabels3D } from "./use-reconciled-labels";

const mockSetReconciledLabels3D = vi.fn();
let mockStagedPolylineTransforms: Record<
  string,
  PolylinePointTransformData
> | null = null;
let mockStagedCuboidTransforms: Record<string, CuboidTransformData> | null =
  null;
let mockCurrentSampleId = "sample-123";
let mockCurrentActiveField = "predictions";

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn((atom) => {
    // Determine which atom is being accessed based on the atom's key or identity
    const atomKey = atom?.key || atom?.toString() || "";

    if (atomKey.includes("currentActiveAnnotationField")) {
      return mockCurrentActiveField;
    }
    if (atomKey.includes("currentSampleId")) {
      return mockCurrentSampleId;
    }
    throw new Error(`Unmocked atom accessed: ${atomKey}`);
  }),
  useSetRecoilState: vi.fn(() => mockSetReconciledLabels3D),
}));

vi.mock("@fiftyone/state", () => ({
  currentSampleId: { key: "currentSampleId" },
}));

vi.mock("../state", () => ({
  currentActiveAnnotationField3dAtom: { key: "currentActiveAnnotationField" },
  reconciledLabels3DSelector: { key: "reconciledLabels3DSelector" },
}));

vi.mock("@fiftyone/core/src/components/Modal/Sidebar/Annotate", () => ({
  coerceStringBooleans: vi.fn((obj) => obj),
}));

// Helper functions to create test data
const createDetectionOverlay = (
  id: string,
  location: [number, number, number],
  dimensions: [number, number, number],
  overrides: Partial<OverlayLabel> = {}
): OverlayLabel =>
  ({
    _id: id,
    _cls: "Detection",
    path: "predictions.detections",
    selected: false,
    sampleId: mockCurrentSampleId,
    location,
    dimensions,
    ...overrides,
  } as OverlayLabel);

const createPolylineOverlay = (
  id: string,
  points3d: [number, number, number][][],
  overrides: Partial<OverlayLabel> = {}
): OverlayLabel & { points3d: [number, number, number][][] } =>
  ({
    _id: id,
    _cls: "Polyline",
    path: "predictions.polylines",
    selected: false,
    sampleId: mockCurrentSampleId,
    points3d,
    ...overrides,
  } as OverlayLabel & { points3d: [number, number, number][][] });

describe("useReconciledLabels3D", () => {
  beforeEach(() => {
    mockStagedPolylineTransforms = null;
    mockStagedCuboidTransforms = null;
    mockCurrentSampleId = "sample-123";
    mockCurrentActiveField = "predictions";
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("basic functionality", () => {
    it("returns empty arrays when rawOverlays is empty", () => {
      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms: mockStagedPolylineTransforms ?? {},
          stagedCuboidTransforms: mockStagedCuboidTransforms ?? {},
        })
      );

      expect(result.current.detections).toEqual([]);
      expect(result.current.polylines).toEqual([]);
    });

    it("syncs reconciled labels to state via effect", () => {
      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms: mockStagedPolylineTransforms ?? {},
          stagedCuboidTransforms: mockStagedCuboidTransforms ?? {},
        })
      );

      // The useEffect should have called setReconciledLabels3D
      expect(mockSetReconciledLabels3D).toHaveBeenCalledWith(result.current);
    });
  });

  describe("detection processing", () => {
    it("processes detection overlays without staged transforms", () => {
      const detection = createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [detection],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(1);
      expect(result.current.detections[0]._id).toBe("det-1");
      expect(result.current.polylines).toHaveLength(0);
    });

    it("merges detection with staged transform", () => {
      const detection = createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]);

      const stagedCuboidTransforms = {
        "det-1": {
          location: [10, 20, 30] as [number, number, number],
          dimensions: [40, 50, 60] as [number, number, number],
          rotation: [0.1, 0.2, 0.3] as [number, number, number],
        },
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [detection],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms,
        })
      );

      expect(result.current.detections).toHaveLength(1);
      expect(result.current.detections[0].location).toEqual([10, 20, 30]);
      expect(result.current.detections[0].dimensions).toEqual([40, 50, 60]);
      expect(result.current.detections[0].rotation).toEqual([0.1, 0.2, 0.3]);
    });

    it("creates new detection from staged transform when not in raw overlays", () => {
      const stagedCuboidTransforms = {
        "new-det": {
          location: [1, 2, 3] as [number, number, number],
          dimensions: [4, 5, 6] as [number, number, number],
        },
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms,
        })
      );

      expect(result.current.detections).toHaveLength(1);
      expect(result.current.detections[0]._id).toBe("new-det");
      expect(result.current.detections[0].isNew).toBe(true);
      expect(result.current.detections[0]._cls).toBe("Detection");
    });

    it("skips new detections missing required data (location or dimensions)", () => {
      const stagedCuboidTransforms = {
        "incomplete-det": {
          location: [1, 2, 3],
          // Missing dimensions
        } as CuboidTransformData,
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms,
        })
      );

      expect(result.current.detections).toHaveLength(0);
    });

    it("filters detection overlays without location or dimensions", () => {
      const invalidDetection: OverlayLabel = {
        _id: "invalid-det",
        _cls: "Detection",
        path: "predictions.detections",
        selected: false,
        // Missing location and dimensions
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [invalidDetection],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(0);
    });
  });

  describe("polyline processing", () => {
    it("processes polyline overlays without staged transforms", () => {
      const polyline = createPolylineOverlay("poly-1", [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      ]);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [polyline],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(1);
      expect(result.current.polylines[0]._id).toBe("poly-1");
      expect(result.current.detections).toHaveLength(0);
    });

    it("merges polyline with staged transform", () => {
      const polyline = createPolylineOverlay("poly-1", [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      ]);

      const stagedPolylineTransforms = {
        "poly-1": {
          segments: [
            {
              points: [
                [10, 20, 30],
                [40, 50, 60],
              ] as [number, number, number][],
            },
          ],
        },
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [polyline],
          stagedPolylineTransforms,
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(1);
      expect(result.current.polylines[0].points3d).toEqual([
        [
          [10, 20, 30],
          [40, 50, 60],
        ],
      ]);
    });

    it("creates new polyline from staged transform when not in raw overlays", () => {
      const stagedPolylineTransforms = {
        "new-poly": {
          segments: [
            {
              points: [
                [1, 2, 3],
                [4, 5, 6],
              ] as [number, number, number][],
            },
          ],
          sampleId: mockCurrentSampleId,
        },
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms,
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(1);
      expect(result.current.polylines[0]._id).toBe("new-poly");
      expect(result.current.polylines[0].isNew).toBe(true);
      expect(result.current.polylines[0]._cls).toBe("Polyline");
    });

    it("skips new polylines for different sample", () => {
      const stagedPolylineTransforms = {
        "other-sample-poly": {
          segments: [
            {
              points: [
                [1, 2, 3],
                [4, 5, 6],
              ] as [number, number, number][],
            },
          ],
          sampleId: "different-sample",
        },
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [],
          stagedPolylineTransforms,
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(0);
    });

    it("filters out polylines with empty points3d", () => {
      const polyline = createPolylineOverlay("poly-1", []);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [polyline],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(0);
    });

    it("filters polyline overlays without points3d property", () => {
      const invalidPolyline: OverlayLabel = {
        _id: "invalid-poly",
        _cls: "Polyline",
        path: "predictions.polylines",
        selected: false,
        // Missing points3d
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [invalidPolyline],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.polylines).toHaveLength(0);
    });
  });

  describe("mixed overlays", () => {
    it("processes both detections and polylines together", () => {
      const detection = createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]);
      const polyline = createPolylineOverlay("poly-1", [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      ]);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [detection, polyline],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(1);
      expect(result.current.polylines).toHaveLength(1);
    });

    it("processes multiple detections and polylines", () => {
      const overlays = [
        createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]),
        createDetectionOverlay("det-2", [7, 8, 9], [10, 11, 12]),
        createPolylineOverlay("poly-1", [
          [
            [1, 2, 3],
            [4, 5, 6],
          ],
        ]),
        createPolylineOverlay("poly-2", [
          [
            [7, 8, 9],
            [10, 11, 12],
          ],
        ]),
      ];

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: overlays,
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(2);
      expect(result.current.polylines).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("returns only existing overlays when currentSampleId is null", () => {
      mockCurrentSampleId = null;
      const stagedCuboidTransforms = {
        "new-det": {
          location: [1, 2, 3] as [number, number, number],
          dimensions: [4, 5, 6] as [number, number, number],
        },
      };

      const detection = createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [detection],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms,
        })
      );

      // Should process existing but not create new labels
      expect(result.current.detections).toHaveLength(1);
      expect(result.current.detections[0]._id).toBe("det-1");
    });

    it("handles empty staged transforms", () => {
      const detection = createDetectionOverlay("det-1", [1, 2, 3], [4, 5, 6]);

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [detection],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(1);
    });

    it("ignores overlays with unknown _cls", () => {
      const unknownOverlay: OverlayLabel = {
        _id: "unknown-1",
        _cls: "UnknownType",
        path: "predictions.unknown",
        selected: false,
      };

      const { result } = renderHook(() =>
        useReconciledLabels3D({
          rawOverlays: [unknownOverlay],
          stagedPolylineTransforms: {},
          stagedCuboidTransforms: {},
        })
      );

      expect(result.current.detections).toHaveLength(0);
      expect(result.current.polylines).toHaveLength(0);
    });
  });
});
