import { ModalMode } from "@fiftyone/state";
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
  getPointCloudCropKey,
  getSelectedCuboidPointCloudCrop,
  isPointInsidePointCloudCrop,
} from "./point-cloud-crop";

const buildDetection = (
  overrides: Partial<ReconciledDetection3D> = {},
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
  }) as ReconciledDetection3D;

describe("point-cloud crop", () => {
  it("does not create a crop outside annotate mode", () => {
    const crop = getSelectedCuboidPointCloudCrop({
      mode: ModalMode.EXPLORE,
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
        mode: ModalMode.ANNOTATE,
        renderModel,
        selectedLabelId: null,
      }),
    ).toBeNull();
    expect(
      getSelectedCuboidPointCloudCrop({
        mode: ModalMode.ANNOTATE,
        renderModel,
        selectedLabelId: "polyline-1",
      }),
    ).toBeNull();
  });

  it("does not create a crop for invalid cuboid geometry", () => {
    expect(
      createPointCloudCropFromDetection(
        buildDetection({ dimensions: [0, 1, 1] }),
      ),
    ).toBeNull();
    expect(
      createPointCloudCropFromDetection(
        buildDetection({ location: [Number.NaN, 0, 0] }),
      ),
    ).toBeNull();
  });

  it("expands the selected cuboid by the configured margin", () => {
    const crop = createPointCloudCropFromDetection(buildDetection(), {
      margin: 1,
    });

    expect(crop?.halfSize.toArray()).toEqual([2, 3, 4]);
    expect(isPointInsidePointCloudCrop(new Vector3(1.99, 0, 0), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2.01, 0, 0), crop!)).toBe(
      false,
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
      { margin: 0.5 },
    );

    expect(crop?.labelId).toBe("cuboid-creation-preview");
    expect(crop?.center.toArray()).toEqual([1, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 2.5, 3.5]);
  });

  it("creates a padded axis-aligned crop around a raycast hover point", () => {
    const crop = createPointCloudCropFromPoint([1, 2, 3], {
      margin: 1.5,
      visibleWorldHeightAtPoint: 4,
    });

    expect(crop?.source).toBe("raycast-hover");
    expect(crop?.visibleWorldHeightAtCenter).toBe(4);
    expect(crop?.center.toArray()).toEqual([1, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 1.5, 1.5]);
    expect(isPointInsidePointCloudCrop(new Vector3(2.49, 2, 3), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2.51, 2, 3), crop!)).toBe(
      false,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2.1, 3.1, 4.1), crop!)).toBe(
      true,
    );
  });

  it("keeps raycast hover point crops centered when scene up is provided", () => {
    const crop = createPointCloudCropFromPoint([0, 0, 0], {
      margin: 1,
      upVector: new Vector3(0, 1, 0),
    });

    expect(crop?.center.toArray()).toEqual([0, 0, 0]);
    expect(crop?.halfSize.toArray()).toEqual([1, 1, 1]);
    expect(isPointInsidePointCloudCrop(new Vector3(0, 0.99, 0), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, 1.01, 0), crop!)).toBe(
      false,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, -0.99, 0), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, -1.01, 0), crop!)).toBe(
      false,
    );
  });

  it("orients raycast hover point crops to non-Y scene up without shifting center", () => {
    const crop = createPointCloudCropFromPoint([0, 0, 0], {
      margin: 1,
      upVector: new Vector3(0, 0, 1),
    });

    expect(crop?.center.toArray()).toEqual([0, 0, 0]);
    expect(crop?.halfSize.toArray()).toEqual([1, 1, 1]);
    expect(isPointInsidePointCloudCrop(new Vector3(0, 0, 0.99), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, 0, 1.01), crop!)).toBe(
      false,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, 0, -0.99), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0, 0, -1.01), crop!)).toBe(
      false,
    );
  });

  it("does not create a raycast hover crop without usable point geometry", () => {
    expect(
      createPointCloudCropFromPoint([Number.NaN, 0, 0], { margin: 1 }),
    ).toBeNull();
    expect(createPointCloudCropFromPoint([0, 0, 0], { margin: 0 })).toBeNull();
  });

  it("prefers quaternion rotation over Euler rotation", () => {
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2,
    );
    const crop = createPointCloudCropFromDetection(
      buildDetection({
        dimensions: [2, 0.5, 0.5],
        quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        rotation: [0, 0, 0],
      }),
      { margin: 0 },
    );

    expect(isPointInsidePointCloudCrop(new Vector3(0, 0.9, 0), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0.9, 0, 0), crop!)).toBe(
      false,
    );
  });

  it("falls back to Euler rotation when quaternion is absent", () => {
    const crop = createPointCloudCropFromDetection(
      buildDetection({
        dimensions: [2, 0.5, 0.5],
        quaternion: undefined,
        rotation: [0, 0, Math.PI / 2],
      }),
      { margin: 0 },
    );

    expect(isPointInsidePointCloudCrop(new Vector3(0, 0.9, 0), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(0.9, 0, 0), crop!)).toBe(
      false,
    );
  });

  it("mirrors legacy-coordinate center adjustment", () => {
    const crop = createPointCloudCropFromDetection(
      buildDetection({ location: [0, 10, 0], dimensions: [2, 4, 6] }),
      { useLegacyCoordinates: true },
    );

    expect(crop?.center.toArray()).toEqual([0, 8, 0]);
  });

  it("uses live render-model transforms when deriving the selected crop", () => {
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2,
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
      mode: ModalMode.ANNOTATE,
      renderModel: deriveRenderModel(workingDoc, transient),
      selectedLabelId: detection._id,
      margin: 0,
    });

    expect(crop?.center.toArray()).toEqual([2, 2, 3]);
    expect(crop?.halfSize.toArray()).toEqual([1.5, 2, 2.5]);
    expect(isPointInsidePointCloudCrop(new Vector3(2, 3.49, 3), crop!)).toBe(
      true,
    );
    expect(isPointInsidePointCloudCrop(new Vector3(2, 3.51, 3), crop!)).toBe(
      false,
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
        mode: ModalMode.ANNOTATE,
        renderModel,
        selectedLabelId: "polyline-1",
      }),
    ).toBeNull();
  });
});

describe("getPointCloudCropKey", () => {
  it("returns 'none' when there is no crop", () => {
    expect(getPointCloudCropKey(null)).toBe("none");
    expect(getPointCloudCropKey(undefined)).toBe("none");
  });

  it("changes as a raycast-hover crop tracks a new point", () => {
    // Raycast-hover crops all share the same labelId ("raycast-hover"), so the
    // key has to vary by geometry (worldToBox) as the pointer moves — otherwise
    // the point-cloud material never remounts and the shader crop stays stale.
    const first = createPointCloudCropFromPoint([1, 2, 3], {
      margin: 1,
      source: "raycast-hover",
    });
    const moved = createPointCloudCropFromPoint([4, 5, 6], {
      margin: 1,
      source: "raycast-hover",
    });

    expect(first).not.toBeNull();
    expect(moved).not.toBeNull();
    expect(first?.labelId).toBe(moved?.labelId);
    expect(getPointCloudCropKey(first)).not.toBe(getPointCloudCropKey(moved));
  });

  it("is stable for an unchanged crop", () => {
    const crop = createPointCloudCropFromPoint([1, 2, 3], {
      margin: 1,
      source: "raycast-hover",
    });
    const same = createPointCloudCropFromPoint([1, 2, 3], {
      margin: 1,
      source: "raycast-hover",
    });

    expect(getPointCloudCropKey(crop)).toBe(getPointCloudCropKey(same));
  });
});
