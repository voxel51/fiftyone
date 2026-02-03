import { describe, expect, it } from "vitest";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import {
  applyTransientToCuboid,
  applyTransientToPolyline,
  deriveRenderModel,
} from "./renderModel";
import type {
  TransientCuboidState,
  TransientPolylineState,
  TransientStore,
  WorkingDoc,
} from "./types";

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createDetection(
  id: string,
  overrides: Partial<ReconciledDetection3D> = {}
): ReconciledDetection3D {
  return {
    _id: id,
    _cls: "Detection",
    type: "Detection",
    path: "predictions",
    location: [0, 0, 0],
    dimensions: [1, 1, 1],
    rotation: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    selected: false,
    sampleId: "sample1",
    tags: [],
    ...overrides,
  };
}

function createPolyline(
  id: string,
  overrides: Partial<ReconciledPolyline3D> = {}
): ReconciledPolyline3D {
  return {
    _id: id,
    _cls: "Polyline",
    type: "Polyline",
    path: "predictions",
    points3d: [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
    ],
    selected: false,
    sampleId: "sample1",
    tags: [],
    ...overrides,
  };
}

function createEmptyTransientStore(): TransientStore {
  return {
    cuboids: {},
    polylines: {},
    dragInProgress: false,
  };
}

function createEmptyWorkingDoc(): WorkingDoc {
  return {
    labelsById: {},
    deletedIds: new Set(),
  };
}

// =============================================================================
// renderModel.ts TESTS
// =============================================================================

describe("applyTransientToCuboid", () => {
  it("returns detection unchanged when transient is undefined", () => {
    const detection = createDetection("det1", {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    });

    const result = applyTransientToCuboid(detection, undefined);

    expect(result).toEqual(detection);
  });

  it("returns detection unchanged when transient is empty", () => {
    const detection = createDetection("det1", {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    });
    const transient: TransientCuboidState = {};

    const result = applyTransientToCuboid(detection, transient);

    expect(result.location).toEqual([1, 2, 3]);
    expect(result.dimensions).toEqual([4, 5, 6]);
  });

  it("applies position delta", () => {
    const detection = createDetection("det1", {
      location: [1, 2, 3],
    });
    const transient: TransientCuboidState = {
      positionDelta: [10, 20, 30],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result.location).toEqual([11, 22, 33]);
    // Original should be unchanged
    expect(detection.location).toEqual([1, 2, 3]);
  });

  it("applies dimensions delta", () => {
    const detection = createDetection("det1", {
      dimensions: [2, 4, 6],
    });
    const transient: TransientCuboidState = {
      dimensionsDelta: [1, 2, 3],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result.dimensions).toEqual([3, 6, 9]);
  });

  it("applies quaternion override", () => {
    const detection = createDetection("det1", {
      quaternion: [0, 0, 0, 1],
    });
    const transient: TransientCuboidState = {
      quaternionOverride: [0.5, 0.5, 0.5, 0.5],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result.quaternion).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("applies all transient properties together", () => {
    const detection = createDetection("det1", {
      location: [1, 2, 3],
      dimensions: [2, 4, 6],
      quaternion: [0, 0, 0, 1],
    });
    const transient: TransientCuboidState = {
      positionDelta: [10, 20, 30],
      dimensionsDelta: [1, 2, 3],
      quaternionOverride: [0.5, 0.5, 0.5, 0.5],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result.location).toEqual([11, 22, 33]);
    expect(result.dimensions).toEqual([3, 6, 9]);
    expect(result.quaternion).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("handles negative deltas", () => {
    const detection = createDetection("det1", {
      location: [10, 20, 30],
      dimensions: [5, 5, 5],
    });
    const transient: TransientCuboidState = {
      positionDelta: [-5, -10, -15],
      dimensionsDelta: [-1, -2, -3],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result.location).toEqual([5, 10, 15]);
    expect(result.dimensions).toEqual([4, 3, 2]);
  });

  it("preserves other detection properties", () => {
    const detection = createDetection("det1", {
      location: [1, 2, 3],
      path: "custom_path",
      selected: true,
      tags: ["tag1", "tag2"],
    });
    const transient: TransientCuboidState = {
      positionDelta: [1, 1, 1],
    };

    const result = applyTransientToCuboid(detection, transient);

    expect(result._id).toBe("det1");
    expect(result.path).toBe("custom_path");
    expect(result.selected).toBe(true);
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });
});

describe("applyTransientToPolyline", () => {
  it("returns polyline unchanged when transient is undefined", () => {
    const polyline = createPolyline("poly1");

    const result = applyTransientToPolyline(polyline, undefined);

    expect(result).toEqual(polyline);
  });

  it("returns polyline unchanged when transient is empty", () => {
    const polyline = createPolyline("poly1");
    const transient: TransientPolylineState = {};

    const result = applyTransientToPolyline(polyline, transient);

    expect(result.points3d).toEqual(polyline.points3d);
  });

  it("applies position delta to all vertices", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
      ],
    });
    const transient: TransientPolylineState = {
      positionDelta: [10, 20, 30],
    };

    const result = applyTransientToPolyline(polyline, transient);

    expect(result.points3d).toEqual([
      [
        [10, 20, 30],
        [11, 20, 30],
        [11, 21, 30],
      ],
    ]);
  });

  it("applies position delta to multiple segments", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [2, 2, 2],
          [3, 3, 3],
        ],
      ],
    });
    const transient: TransientPolylineState = {
      positionDelta: [5, 5, 5],
    };

    const result = applyTransientToPolyline(polyline, transient);

    expect(result.points3d).toEqual([
      [
        [5, 5, 5],
        [6, 5, 5],
      ],
      [
        [7, 7, 7],
        [8, 8, 8],
      ],
    ]);
  });

  it("applies vertex deltas to specific vertices", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      ],
    });
    const transient: TransientPolylineState = {
      vertexDeltas: {
        "0-1": [0, 5, 0], // Move middle vertex up
      },
    };

    const result = applyTransientToPolyline(polyline, transient);

    expect(result.points3d).toEqual([
      [
        [0, 0, 0],
        [1, 5, 0],
        [2, 0, 0],
      ],
    ]);
  });

  it("applies vertex deltas to vertices in different segments", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
      ],
    });
    const transient: TransientPolylineState = {
      vertexDeltas: {
        "0-0": [0, 1, 0],
        "1-1": [0, 2, 0],
      },
    };

    const result = applyTransientToPolyline(polyline, transient);

    expect(result.points3d).toEqual([
      [
        [0, 1, 0],
        [1, 0, 0],
      ],
      [
        [2, 0, 0],
        [3, 2, 0],
      ],
    ]);
  });

  it("applies both position delta and vertex deltas", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ],
    });
    const transient: TransientPolylineState = {
      positionDelta: [10, 10, 10],
      vertexDeltas: {
        "0-1": [0, 5, 0],
      },
    };

    const result = applyTransientToPolyline(polyline, transient);

    // Position delta is applied first, then vertex deltas
    expect(result.points3d).toEqual([
      [
        [10, 10, 10],
        [11, 15, 10],
      ],
    ]);
  });

  it("preserves other polyline properties", () => {
    const polyline = createPolyline("poly1", {
      path: "custom_path",
      selected: true,
      tags: ["tag1"],
      filled: true,
      closed: true,
    });
    const transient: TransientPolylineState = {
      positionDelta: [1, 1, 1],
    };

    const result = applyTransientToPolyline(polyline, transient);

    expect(result._id).toBe("poly1");
    expect(result.path).toBe("custom_path");
    expect(result.selected).toBe(true);
    expect(result.tags).toEqual(["tag1"]);
    expect(result.filled).toBe(true);
    expect(result.closed).toBe(true);
  });

  it("does not mutate original polyline", () => {
    const originalPoints: [number, number, number][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
    ];
    const polyline = createPolyline("poly1", {
      points3d: originalPoints,
    });
    const transient: TransientPolylineState = {
      positionDelta: [10, 10, 10],
    };

    applyTransientToPolyline(polyline, transient);

    expect(polyline.points3d[0][0]).toEqual([0, 0, 0]);
  });
});

describe("deriveRenderModel", () => {
  it("returns empty model for empty working doc", () => {
    const workingDoc = createEmptyWorkingDoc();
    const transient = createEmptyTransientStore();

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toEqual([]);
    expect(result.polylines).toEqual([]);
  });

  it("returns detections from working doc", () => {
    const detection = createDetection("det1");
    const workingDoc: WorkingDoc = {
      labelsById: { det1: detection },
      deletedIds: new Set(),
    };
    const transient = createEmptyTransientStore();

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]._id).toBe("det1");
    expect(result.polylines).toHaveLength(0);
  });

  it("returns polylines from working doc", () => {
    const polyline = createPolyline("poly1");
    const workingDoc: WorkingDoc = {
      labelsById: { poly1: polyline },
      deletedIds: new Set(),
    };
    const transient = createEmptyTransientStore();

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.polylines).toHaveLength(1);
    expect(result.polylines[0]._id).toBe("poly1");
    expect(result.detections).toHaveLength(0);
  });

  it("separates detections and polylines", () => {
    const detection = createDetection("det1");
    const polyline = createPolyline("poly1");
    const workingDoc: WorkingDoc = {
      labelsById: {
        det1: detection,
        poly1: polyline,
      },
      deletedIds: new Set(),
    };
    const transient = createEmptyTransientStore();

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toHaveLength(1);
    expect(result.polylines).toHaveLength(1);
  });

  it("excludes deleted labels", () => {
    const detection1 = createDetection("det1");
    const detection2 = createDetection("det2");
    const polyline = createPolyline("poly1");
    const workingDoc: WorkingDoc = {
      labelsById: {
        det1: detection1,
        det2: detection2,
        poly1: polyline,
      },
      deletedIds: new Set(["det1", "poly1"]),
    };
    const transient = createEmptyTransientStore();

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]._id).toBe("det2");
    expect(result.polylines).toHaveLength(0);
  });

  it("applies transient state to detections", () => {
    const detection = createDetection("det1", {
      location: [0, 0, 0],
    });
    const workingDoc: WorkingDoc = {
      labelsById: { det1: detection },
      deletedIds: new Set(),
    };
    const transient: TransientStore = {
      cuboids: {
        det1: { positionDelta: [5, 10, 15] },
      },
      polylines: {},
      dragInProgress: true,
    };

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections[0].location).toEqual([5, 10, 15]);
  });

  it("applies transient state to polylines", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ],
    });
    const workingDoc: WorkingDoc = {
      labelsById: { poly1: polyline },
      deletedIds: new Set(),
    };
    const transient: TransientStore = {
      cuboids: {},
      polylines: {
        poly1: { positionDelta: [10, 10, 10] },
      },
      dragInProgress: true,
    };

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.polylines[0].points3d).toEqual([
      [
        [10, 10, 10],
        [11, 10, 10],
      ],
    ]);
  });

  it("handles multiple labels with mixed transient states", () => {
    const det1 = createDetection("det1", { location: [0, 0, 0] });
    const det2 = createDetection("det2", { location: [10, 10, 10] });
    const poly1 = createPolyline("poly1", {
      points3d: [[[0, 0, 0]]],
    });
    const poly2 = createPolyline("poly2", {
      points3d: [[[5, 5, 5]]],
    });

    const workingDoc: WorkingDoc = {
      labelsById: {
        det1,
        det2,
        poly1,
        poly2,
      },
      deletedIds: new Set(),
    };
    const transient: TransientStore = {
      cuboids: {
        det1: { positionDelta: [1, 1, 1] },
        // det2 has no transient state
      },
      polylines: {
        // poly1 has no transient state
        poly2: { positionDelta: [2, 2, 2] },
      },
      dragInProgress: false,
    };

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toHaveLength(2);
    expect(result.polylines).toHaveLength(2);

    const resultDet1 = result.detections.find((d) => d._id === "det1");
    const resultDet2 = result.detections.find((d) => d._id === "det2");
    const resultPoly1 = result.polylines.find((p) => p._id === "poly1");
    const resultPoly2 = result.polylines.find((p) => p._id === "poly2");

    expect(resultDet1?.location).toEqual([1, 1, 1]);
    expect(resultDet2?.location).toEqual([10, 10, 10]);
    expect(resultPoly1?.points3d).toEqual([[[0, 0, 0]]]);
    expect(resultPoly2?.points3d).toEqual([[[7, 7, 7]]]);
  });

  it("does not apply transient state from deleted labels", () => {
    const detection = createDetection("det1", { location: [0, 0, 0] });
    const workingDoc: WorkingDoc = {
      labelsById: { det1: detection },
      deletedIds: new Set(["det1"]),
    };
    const transient: TransientStore = {
      cuboids: {
        det1: { positionDelta: [5, 5, 5] },
      },
      polylines: {},
      dragInProgress: true,
    };

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections).toHaveLength(0);
  });

  it("handles empty transient state for existing labels", () => {
    const detection = createDetection("det1", { location: [1, 2, 3] });
    const workingDoc: WorkingDoc = {
      labelsById: { det1: detection },
      deletedIds: new Set(),
    };
    const transient: TransientStore = {
      cuboids: {
        det1: {}, // Empty transient state
      },
      polylines: {},
      dragInProgress: false,
    };

    const result = deriveRenderModel(workingDoc, transient);

    expect(result.detections[0].location).toEqual([1, 2, 3]);
  });
});
