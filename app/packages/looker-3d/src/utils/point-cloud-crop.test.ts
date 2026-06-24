import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  deriveRenderModel,
  type TransientStore,
  type WorkingDoc,
} from "../annotation/store";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import {
  createPointCloudCropFromCuboidTransform,
  createPointCloudCropFromDetection,
  createPointCloudCropFromPoint,
  createPointCloudCropFromPolyline,
  getLabelPointCloudCrop,
  getSelectedCuboidPointCloudCrop,
  isPointInsidePointCloudCrop,
} from "./point-cloud-crop";

const buildDetection = (
  overrides: Partial<ReconciledDetection3D> = {}
): ReconciledDetection3D =>
  ({
    _cls: "Detection",
    _id: "detection-1",
    path: "ground_truth",
    label: "car",
    location: [0, 0, 0],
    dimensions: [2, 4, 6],
    rotation: [0, 0, 0],
    ...overrides,
  } as ReconciledDetection3D);

const buildPolyline = (
  overrides: Partial<ReconciledPolyline3D> = {}
): ReconciledPolyline3D =>
  ({
    _cls: "Polyline",
    _id: "polyline-1",
    path: "lanes",
    label: "lane",
    points3d: [
      [
        [-1, -2, 0],
        [3, 2, 4],
      ],
    ],
    ...overrides,
  } as ReconciledPolyline3D);

describe("point-cloud crop", () => {
  it("does not create a crop outside annotate mode", () => {
    const crop = getSelectedCuboidPointCloudCrop({
      mode: "explore",
      renderModel: { detections: [buildDetection()], polylines: [] },
      selectedLabelId: "detection-1",
    });

    expect(crop).toBeNull();
  });

  it("does not create a crop without a selected cuboid", () => {
    const renderModel = {
      detections: [buildDetection()],
      polylines: [
        {
          _cls: "Polyline",
          _id: "polyline-1",
          path: "lanes",
          points3d: [[[0, 0, 0]]],
        },
      ],
    } as ReturnType<typeof deriveRenderModel>;

    expect(
      getSelectedCuboidPointCloudCrop({
        mode: "annotate",
        renderModel,
        selectedLabelId: null,
      })
    ).toBeNull();
    expect(
      getSelectedCuboidPointCloudCrop({
        mode: "annotate",
        renderModel,
        selectedLabelId: "polyline-1",
      })
    ).toBeNull();
  });

  it("does not create a crop for invalid cuboid geometry", () => {
    expect(
      createPointCloudCropFromDetection(
        buildDetection({ dimensions: [0, 1, 1] })
      )
    ).toBeNull();
    expect(
      createPointCloudCropFromDetection(
        buildDetection({ location: [Number.NaN, 0, 0] })
      )
    ).toBeNull();
  });

  it("expands the selected cuboid by the configured margin", () => {
    const crop = createPointCloudCropFromDetection(buildDetection(), {
      margin: 1,
    });

    expect(crop?.halfSize.toArray()).toEqual([2, 3, 4]);
    expect(isPointInsidePointCloudCrop(new Vector3(1.99, 0, 0), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2.01, 0, 0), crop!)).toBe(
      false
    );
  });

  it("creates a crop from cuboid creation preview geometry", () => {
    const crop = createPointCloudCropFromCuboidTransform(
      "cuboid-creation-preview",
      {
        location: [1, 2, 3],
        dimensions: [2, 4, 6],
        quaternion: [0, 0, 0, 1],
      },
      { margin: 0.5 }
    );

    expect(crop?.labelId).toBe("cuboid-creation-preview");
    expect(crop?.center.toArray()).toEqual([1, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 2.5, 3.5]);
  });

  it("creates a padded axis-aligned crop for hovered polylines", () => {
    const crop = createPointCloudCropFromPolyline(buildPolyline(), {
      margin: 1,
      source: "hover",
    });

    expect(crop?.source).toBe("hover");
    expect(crop?.center.toArray()).toEqual([1, 0, 2]);
    expect(crop?.halfSize.toArray()).toEqual([3, 3, 3]);
    expect(isPointInsidePointCloudCrop(new Vector3(3.9, 0, 2), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(4.1, 0, 2), crop!)).toBe(
      false
    );
  });

  it("does not create a crop for invalid polyline geometry", () => {
    expect(
      createPointCloudCropFromPolyline(
        buildPolyline({ points3d: [[[Number.NaN, 0, 0]]] })
      )
    ).toBeNull();
  });

  it("creates a padded axis-aligned crop around a raycast hover point", () => {
    const crop = createPointCloudCropFromPoint([1, 2, 3], {
      margin: 1.5,
    });

    expect(crop?.source).toBe("raycast-hover");
    expect(crop?.center.toArray()).toEqual([1, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 1.5, 1.5]);
    expect(isPointInsidePointCloudCrop(new Vector3(2.49, 2, 3), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2.51, 2, 3), crop!)).toBe(
      false
    );
  });

  it("does not create a raycast hover crop without usable point geometry", () => {
    expect(
      createPointCloudCropFromPoint([Number.NaN, 0, 0], { margin: 1 })
    ).toBeNull();
    expect(createPointCloudCropFromPoint([0, 0, 0], { margin: 0 })).toBeNull();
  });

  it("prefers quaternion rotation over Euler rotation", () => {
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2
    );
    const crop = createPointCloudCropFromDetection(
      buildDetection({
        dimensions: [2, 0.5, 0.5],
        quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        rotation: [0, 0, 0],
      }),
      { margin: 0 }
    );

    expect(isPointInsidePointCloudCrop(new Vector3(0, 0.9, 0), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0.9, 0, 0), crop!)).toBe(
      false
    );
  });

  it("falls back to Euler rotation when quaternion is absent", () => {
    const crop = createPointCloudCropFromDetection(
      buildDetection({
        dimensions: [2, 0.5, 0.5],
        quaternion: undefined,
        rotation: [0, 0, Math.PI / 2],
      }),
      { margin: 0 }
    );

    expect(isPointInsidePointCloudCrop(new Vector3(0, 0.9, 0), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0.9, 0, 0), crop!)).toBe(
      false
    );
  });

  it("mirrors legacy-coordinate center adjustment", () => {
    const crop = createPointCloudCropFromDetection(
      buildDetection({ location: [0, 10, 0], dimensions: [2, 4, 6] }),
      { useLegacyCoordinates: true }
    );

    expect(crop?.center.toArray()).toEqual([0, 8, 0]);
  });

  it("uses live render-model transforms when deriving the selected crop", () => {
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2
    );
    const detection = buildDetection({
      location: [1, 2, 3],
      dimensions: [2, 2, 2],
    });
    const workingDoc: WorkingDoc = {
      labelsById: { [detection._id]: detection },
      deletedIds: new Set(),
    };
    const transient: TransientStore = {
      cuboids: {
        [detection._id]: {
          positionDelta: [1, 0, 0],
          dimensionsDelta: [1, 2, 3],
          quaternionOverride: [
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w,
          ],
        },
      },
      polylines: {},
      activeDragLabel: detection._id,
    };

    const crop = getSelectedCuboidPointCloudCrop({
      mode: "annotate",
      renderModel: deriveRenderModel(workingDoc, transient),
      selectedLabelId: detection._id,
      margin: 0,
    });

    expect(crop?.center.toArray()).toEqual([2, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 2, 2.5]);
    expect(isPointInsidePointCloudCrop(new Vector3(2, 3.49, 3), crop!)).toBe(
      true
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2, 3.51, 3), crop!)).toBe(
      false
    );
  });

  it("does not derive a crop for selected polylines", () => {
    const renderModel = {
      detections: [],
      polylines: [
        {
          _cls: "Polyline",
          _id: "polyline-1",
          path: "lanes",
          points3d: [[[0, 0, 0]]],
        } as ReconciledPolyline3D,
      ],
    };

    expect(
      getSelectedCuboidPointCloudCrop({
        mode: "annotate",
        renderModel,
        selectedLabelId: "polyline-1",
      })
    ).toBeNull();
  });

  it("derives a hover crop for cuboid and polyline labels", () => {
    const detection = buildDetection();
    const polyline = buildPolyline();
    const renderModel = {
      detections: [detection],
      polylines: [polyline],
    };

    expect(
      getLabelPointCloudCrop({
        mode: "annotate",
        renderModel,
        labelId: detection._id,
        margin: 0,
      })?.source
    ).toBe("hover");
    expect(
      getLabelPointCloudCrop({
        mode: "annotate",
        renderModel,
        labelId: polyline._id,
        margin: 0,
      })?.labelId
    ).toBe(polyline._id);
  });
});
