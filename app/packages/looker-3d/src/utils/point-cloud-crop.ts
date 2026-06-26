import { ModalMode } from "@fiftyone/state";
import * as THREE from "three";
import type { RenderModel } from "../annotation/store";
import type {
  CuboidTransformData,
  ReconciledDetection3D,
} from "../annotation/types";
import {
  DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
  POINT_CLOUD_CROP_BOUNDS_EPSILON,
} from "../constants";

export interface PointCloudCrop {
  labelId: string;
  source?: "creation" | "raycast-hover" | "selection";
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  quaternion: THREE.Quaternion;
  worldToBox: THREE.Matrix4;
  visibleWorldHeightAtCenter?: number | null;
}

interface CreatePointCloudCropOptions {
  margin?: number;
  source?: PointCloudCrop["source"];
  useLegacyCoordinates?: boolean;
}

interface CreatePointCloudCropFromPointOptions extends CreatePointCloudCropOptions {
  labelId?: string;
  upVector?: THREE.Vector3 | null;
  visibleWorldHeightAtPoint?: number | null;
}

interface RenderModelPointCloudCropOptions extends CreatePointCloudCropOptions {
  mode: ModalMode;
  renderModel: RenderModel;
}

interface SelectedPointCloudCropOptions extends RenderModelPointCloudCropOptions {
  selectedLabelId?: string | null;
}

const EPSILON = 1e-6;

const isFiniteNumberTuple = (
  value: unknown,
  length: number,
): value is number[] => {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => Number.isFinite(item))
  );
};

const resolveCropMargin = (margin: number | undefined) => {
  if (!Number.isFinite(margin)) {
    return DEFAULT_SELECTED_CUBOID_CROP_MARGIN;
  }

  return Math.max(0, margin);
};

const getCuboidQuaternion = (cuboid: CuboidTransformData) => {
  if (isFiniteNumberTuple(cuboid.quaternion, 4)) {
    const quaternion = new THREE.Quaternion(...cuboid.quaternion);

    if (quaternion.lengthSq() > EPSILON) {
      return quaternion.normalize();
    }
  }

  if (isFiniteNumberTuple(cuboid.rotation, 3)) {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...cuboid.rotation),
    );
  }

  return new THREE.Quaternion();
};

const getPointCropUpVector = (upVector: THREE.Vector3 | null | undefined) => {
  if (!upVector || upVector.lengthSq() <= EPSILON) {
    return null;
  }

  return upVector.clone().normalize();
};

export const createPointCloudCropFromCuboidTransform = (
  labelId: string,
  cuboid: CuboidTransformData,
  {
    margin,
    source,
    useLegacyCoordinates = false,
  }: CreatePointCloudCropOptions = {},
): PointCloudCrop | null => {
  if (
    !isFiniteNumberTuple(cuboid.location, 3) ||
    !isFiniteNumberTuple(cuboid.dimensions, 3)
  ) {
    return null;
  }

  const size = new THREE.Vector3(
    Math.abs(cuboid.dimensions[0]),
    Math.abs(cuboid.dimensions[1]),
    Math.abs(cuboid.dimensions[2]),
  );

  if (size.x <= EPSILON || size.y <= EPSILON || size.z <= EPSILON) {
    return null;
  }

  const center = new THREE.Vector3(...cuboid.location);
  if (useLegacyCoordinates) {
    center.y -= size.y / 2;
  }

  const resolvedMargin = resolveCropMargin(margin);
  const halfSize = size.multiplyScalar(0.5).addScalar(resolvedMargin);
  const quaternion = getCuboidQuaternion(cuboid);
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );

  return {
    labelId,
    source,
    center,
    halfSize,
    quaternion,
    worldToBox: boxToWorld.clone().invert(),
  };
};

export const createPointCloudCropFromDetection = (
  detection: ReconciledDetection3D,
  options: CreatePointCloudCropOptions = {},
) => {
  return createPointCloudCropFromCuboidTransform(
    detection._id,
    detection,
    options,
  );
};

export const createPointCloudCropFromPoint = (
  point: [number, number, number],
  {
    labelId = "raycast-hover",
    margin,
    source = "raycast-hover",
    upVector,
    visibleWorldHeightAtPoint,
  }: CreatePointCloudCropFromPointOptions = {},
): PointCloudCrop | null => {
  if (!isFiniteNumberTuple(point, 3)) {
    return null;
  }

  const resolvedMargin = resolveCropMargin(margin);
  if (resolvedMargin <= EPSILON) {
    return null;
  }

  const pointVector = new THREE.Vector3(...point);
  const pointCropUpVector = getPointCropUpVector(upVector);
  const center = pointVector;
  const halfSize = new THREE.Vector3(
    resolvedMargin,
    resolvedMargin,
    resolvedMargin,
  );
  const quaternion = pointCropUpVector
    ? new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pointCropUpVector,
      )
    : new THREE.Quaternion();
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );

  return {
    labelId,
    source,
    center,
    halfSize,
    quaternion,
    worldToBox: boxToWorld.clone().invert(),
    visibleWorldHeightAtCenter: visibleWorldHeightAtPoint,
  };
};

export const getSelectedCuboidPointCloudCrop = ({
  mode,
  renderModel,
  selectedLabelId,
  margin,
  useLegacyCoordinates = false,
}: SelectedPointCloudCropOptions): PointCloudCrop | null => {
  if (mode !== ModalMode.ANNOTATE || !selectedLabelId) {
    return null;
  }

  const selectedDetection = renderModel.detections.find(
    (detection) => detection._id === selectedLabelId,
  );

  if (!selectedDetection) {
    return null;
  }

  return createPointCloudCropFromDetection(selectedDetection, {
    margin,
    source: "selection",
    useLegacyCoordinates,
  });
};

export const isPointInsidePointCloudCrop = (
  point: THREE.Vector3,
  crop: PointCloudCrop,
) => {
  const boxPoint = point.clone().applyMatrix4(crop.worldToBox);

  return (
    Math.abs(boxPoint.x) <= crop.halfSize.x + POINT_CLOUD_CROP_BOUNDS_EPSILON &&
    Math.abs(boxPoint.y) <= crop.halfSize.y + POINT_CLOUD_CROP_BOUNDS_EPSILON &&
    Math.abs(boxPoint.z) <= crop.halfSize.z + POINT_CLOUD_CROP_BOUNDS_EPSILON
  );
};

/**
 * Stable identity for a crop's geometry. Folded into the point-cloud material
 * `key` so the shader material remounts (and re-binds its crop uniforms)
 * whenever the crop changes — e.g. as a raycast-hover crop tracks the pointer.
 * Returns "none" when there is no active crop.
 */
export const getPointCloudCropKey = (pointCloudCrop?: PointCloudCrop | null) =>
  pointCloudCrop
    ? `${pointCloudCrop.labelId}-${pointCloudCrop.halfSize
        .toArray()
        .join(",")}-${pointCloudCrop.worldToBox.elements.join(",")}`
    : "none";

export const createPointCloudCropHelperMesh = (crop: PointCloudCrop) => {
  const geometry = new THREE.BoxGeometry(
    crop.halfSize.x * 2,
    crop.halfSize.y * 2,
    crop.halfSize.z * 2,
  );
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const helperMesh = new THREE.Mesh(geometry, material);

  helperMesh.position.copy(crop.center);
  helperMesh.quaternion.copy(crop.quaternion);
  helperMesh.visible = false;

  return helperMesh;
};

export const disposePointCloudCropHelperMesh = (
  helperMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>,
) => {
  helperMesh.geometry.dispose();
  helperMesh.material.dispose();
};
