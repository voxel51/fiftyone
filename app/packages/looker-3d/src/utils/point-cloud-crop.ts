import { ModalMode } from "@fiftyone/state";
import * as THREE from "three";
import type { RenderModel } from "../annotation/store";
import type {
  CuboidTransformData,
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import { DEFAULT_SELECTED_CUBOID_CROP_MARGIN } from "../constants";

export interface PointCloudCrop {
  labelId: string;
  source?: "creation" | "hover" | "raycast-hover" | "selection";
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

interface CreatePointCloudCropFromPointOptions
  extends CreatePointCloudCropOptions {
  labelId?: string;
  upVector?: THREE.Vector3 | null;
  visibleWorldHeightAtPoint?: number | null;
}

interface RenderModelPointCloudCropOptions extends CreatePointCloudCropOptions {
  mode: ModalMode;
  renderModel: RenderModel;
}

interface SelectedPointCloudCropOptions
  extends RenderModelPointCloudCropOptions {
  selectedLabelId?: string | null;
}

interface LabelPointCloudCropOptions extends RenderModelPointCloudCropOptions {
  labelId?: string | null;
}

const EPSILON = 1e-6;
const POINT_CROP_MARGIN_ABOVE_POINT_SCALE = 0.75;
const POINT_CROP_MARGIN_BELOW_POINT_SCALE = 2;

const isFiniteNumberTuple = (
  value: unknown,
  length: number
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
      new THREE.Euler(...cuboid.rotation)
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
  }: CreatePointCloudCropOptions = {}
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
    Math.abs(cuboid.dimensions[2])
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
    new THREE.Vector3(1, 1, 1)
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
  options: CreatePointCloudCropOptions = {}
) => {
  return createPointCloudCropFromCuboidTransform(
    detection._id,
    detection,
    options
  );
};

export const createPointCloudCropFromPolyline = (
  polyline: ReconciledPolyline3D,
  { margin, source }: CreatePointCloudCropOptions = {}
): PointCloudCrop | null => {
  const points = polyline.points3d.flatMap((segment) =>
    segment.filter((point) => isFiniteNumberTuple(point, 3))
  );

  if (points.length === 0) {
    return null;
  }

  const box = new THREE.Box3();

  for (const point of points) {
    box.expandByPoint(new THREE.Vector3(point[0], point[1], point[2]));
  }

  if (box.isEmpty()) {
    return null;
  }

  const resolvedMargin = resolveCropMargin(margin);
  const center = box.getCenter(new THREE.Vector3());
  const halfSize = box
    .getSize(new THREE.Vector3())
    .multiplyScalar(0.5)
    .addScalar(resolvedMargin);
  const quaternion = new THREE.Quaternion();
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1)
  );

  return {
    labelId: polyline._id,
    source,
    center,
    halfSize,
    quaternion,
    worldToBox: boxToWorld.clone().invert(),
  };
};

export const createPointCloudCropFromPoint = (
  point: [number, number, number],
  {
    labelId = "raycast-hover",
    margin,
    source = "raycast-hover",
    upVector,
    visibleWorldHeightAtPoint,
  }: CreatePointCloudCropFromPointOptions = {}
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
  const marginAbovePoint = pointCropUpVector
    ? resolvedMargin * POINT_CROP_MARGIN_ABOVE_POINT_SCALE
    : resolvedMargin;
  const marginBelowPoint = pointCropUpVector
    ? resolvedMargin * POINT_CROP_MARGIN_BELOW_POINT_SCALE
    : resolvedMargin;
  const center = pointCropUpVector
    ? pointVector
        .clone()
        .addScaledVector(
          pointCropUpVector,
          (marginAbovePoint - marginBelowPoint) / 2
        )
    : pointVector;
  const halfSize = new THREE.Vector3(
    resolvedMargin,
    (marginAbovePoint + marginBelowPoint) / 2,
    resolvedMargin
  );
  const quaternion = pointCropUpVector
    ? new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pointCropUpVector
      )
    : new THREE.Quaternion();
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1)
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
    (detection) => detection._id === selectedLabelId
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

export const getLabelPointCloudCrop = ({
  mode,
  renderModel,
  labelId,
  margin,
  useLegacyCoordinates = false,
}: LabelPointCloudCropOptions): PointCloudCrop | null => {
  if (mode !== ModalMode.ANNOTATE || !labelId) {
    return null;
  }

  const detection = renderModel.detections.find(
    (candidate) => candidate._id === labelId
  );
  if (detection) {
    return createPointCloudCropFromDetection(detection, {
      margin,
      source: "hover",
      useLegacyCoordinates,
    });
  }

  const polyline = renderModel.polylines.find(
    (candidate) => candidate._id === labelId
  );
  if (polyline) {
    return createPointCloudCropFromPolyline(polyline, {
      margin,
      source: "hover",
    });
  }

  return null;
};

export const isPointInsidePointCloudCrop = (
  point: THREE.Vector3,
  crop: PointCloudCrop
) => {
  const boxPoint = point.clone().applyMatrix4(crop.worldToBox);

  return (
    Math.abs(boxPoint.x) <= crop.halfSize.x + EPSILON &&
    Math.abs(boxPoint.y) <= crop.halfSize.y + EPSILON &&
    Math.abs(boxPoint.z) <= crop.halfSize.z + EPSILON
  );
};

export const createPointCloudCropHelperMesh = (crop: PointCloudCrop) => {
  const geometry = new THREE.BoxGeometry(
    crop.halfSize.x * 2,
    crop.halfSize.y * 2,
    crop.halfSize.z * 2
  );
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const helperMesh = new THREE.Mesh(geometry, material);

  helperMesh.position.copy(crop.center);
  helperMesh.quaternion.copy(crop.quaternion);
  helperMesh.visible = false;

  return helperMesh;
};

export const disposePointCloudCropHelperMesh = (
  helperMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
) => {
  helperMesh.geometry.dispose();
  helperMesh.material.dispose();
};
