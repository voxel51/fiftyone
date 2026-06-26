import type * as fos from "@fiftyone/state";
import { get } from "lodash";
import {
  Box3,
  Euler,
  Quaternion,
  Vector3,
  type Vector3Tuple,
  type Vector4Tuple,
} from "three";
import type { RenderModel } from "../annotation/store";
import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import { isFiniteVector3 } from "../utils";

type SampleMap = Record<string, fos.ModalSample>;
type LabelWithId = { _id?: string; id?: string };
type SelectedLabelLike = {
  field?: string;
  path?: string;
  labelId?: string;
  id?: string;
  _id?: string;
  sampleId?: string;
};

const MIN_LABEL_CROP_SIZE = 1;

const isFiniteTuple = (value: unknown, length: number): value is number[] => {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((component) => Number.isFinite(component))
  );
};

const isFiniteVector3Tuple = (value: unknown): value is Vector3Tuple =>
  isFiniteTuple(value, 3);

const isFiniteVector4Tuple = (value: unknown): value is Vector4Tuple =>
  isFiniteTuple(value, 4);

const getLabelId = (label: SelectedLabelLike) =>
  label.labelId ?? label._id ?? label.id;

const getLabelPath = (label: SelectedLabelLike) => label.field ?? label.path;

const doesLabelIdMatch = (label: LabelWithId, labelId?: string) => {
  if (!labelId) {
    return false;
  }

  return label._id === labelId || label.id === labelId;
};

const findLabelById = (labels: unknown, labelId?: string): unknown => {
  if (!Array.isArray(labels)) {
    return null;
  }

  if (!labelId && labels.length === 1) {
    return labels[0];
  }

  return (
    labels.find(
      (label): label is LabelWithId =>
        Boolean(label) &&
        typeof label === "object" &&
        doesLabelIdMatch(label as LabelWithId, labelId),
    ) ?? null
  );
};

const has3dGeometry = (label: unknown) => {
  if (!label || typeof label !== "object") {
    return false;
  }

  const candidate = label as {
    dimensions?: unknown;
    location?: unknown;
    points3d?: unknown;
  };

  return (
    (isFiniteVector3Tuple(candidate.dimensions) &&
      isFiniteVector3Tuple(candidate.location)) ||
    Array.isArray(candidate.points3d)
  );
};

export const extractSelectedLabel = (
  labelFieldData: unknown,
  labelId?: string,
): unknown | null => {
  if (!labelFieldData) {
    return null;
  }

  if (Array.isArray(labelFieldData)) {
    return findLabelById(labelFieldData, labelId);
  }

  if (typeof labelFieldData !== "object") {
    return null;
  }

  const candidate = labelFieldData as {
    detections?: unknown;
    polylines?: unknown;
  };

  const detectionsLabel = findLabelById(candidate.detections, labelId);
  if (detectionsLabel) {
    return detectionsLabel;
  }

  const polylineLabel = findLabelById(candidate.polylines, labelId);
  if (polylineLabel) {
    return polylineLabel;
  }

  if (has3dGeometry(labelFieldData)) {
    return labelId && !doesLabelIdMatch(labelFieldData as LabelWithId, labelId)
      ? null
      : labelFieldData;
  }

  return null;
};

const getLabelQuaternion = (
  label: ReconciledDetection3D | Record<string, unknown>,
) => {
  if (isFiniteVector4Tuple(label.quaternion)) {
    return new Quaternion(...label.quaternion);
  }

  if (isFiniteVector3Tuple(label.rotation)) {
    return new Quaternion().setFromEuler(new Euler(...label.rotation));
  }

  return null;
};

const createCuboidBoundingBox = (
  label: ReconciledDetection3D | Record<string, unknown>,
  { useLegacyCoordinates = false }: { useLegacyCoordinates?: boolean } = {},
): Box3 | null => {
  if (
    !isFiniteVector3Tuple(label.location) ||
    !isFiniteVector3Tuple(label.dimensions)
  ) {
    return null;
  }

  const center = new Vector3(...label.location);
  const size = new Vector3(
    Math.abs(label.dimensions[0]),
    Math.abs(label.dimensions[1]),
    Math.abs(label.dimensions[2]),
  );

  if (useLegacyCoordinates) {
    center.y -= size.y / 2;
  }

  const quaternion = getLabelQuaternion(label);
  if (!quaternion) {
    return new Box3().setFromCenterAndSize(center, size);
  }

  const halfSize = size.clone().multiplyScalar(0.5);
  const box = new Box3();
  const signs = [-1, 1];

  for (const xSign of signs) {
    for (const ySign of signs) {
      for (const zSign of signs) {
        box.expandByPoint(
          new Vector3(
            xSign * halfSize.x,
            ySign * halfSize.y,
            zSign * halfSize.z,
          )
            .applyQuaternion(quaternion)
            .add(center),
        );
      }
    }
  }

  return box;
};

const createPolylineBoundingBox = (
  label: ReconciledPolyline3D | Record<string, unknown>,
): Box3 | null => {
  if (!Array.isArray(label.points3d)) {
    return null;
  }

  const box = new Box3();

  for (const segment of label.points3d) {
    if (!Array.isArray(segment)) {
      continue;
    }

    for (const point of segment) {
      if (isFiniteVector3Tuple(point)) {
        box.expandByPoint(new Vector3(...point));
      }
    }
  }

  return box.isEmpty() ? null : box;
};

export const createLabelBoundingBox = (
  label: unknown,
  options: { useLegacyCoordinates?: boolean } = {},
): Box3 | null => {
  if (!label || typeof label !== "object") {
    return null;
  }

  const candidate = label as Record<string, unknown>;

  if (
    candidate._cls === "Detection" ||
    (isFiniteVector3Tuple(candidate.location) &&
      isFiniteVector3Tuple(candidate.dimensions))
  ) {
    return createCuboidBoundingBox(candidate, options);
  }

  if (candidate._cls === "Polyline" || Array.isArray(candidate.points3d)) {
    return createPolylineBoundingBox(candidate);
  }

  return null;
};

const getSampleId = (sample: fos.ModalSample | null | undefined) =>
  sample?.sample?._id ?? sample?.id;

const getCandidateSamples = (
  interactionSample: fos.ModalSample,
  activeSampleMap: SampleMap,
) => {
  const samplesById = new Map<string, fos.ModalSample>();

  for (const sample of [
    interactionSample,
    ...Object.values(activeSampleMap ?? {}),
  ]) {
    const sampleId = getSampleId(sample);
    if (sampleId && !samplesById.has(sampleId)) {
      samplesById.set(sampleId, sample);
    }
  }

  return [...samplesById.values()];
};

const findSampleForSelection = (
  selectedLabel: SelectedLabelLike,
  interactionSample: fos.ModalSample,
  activeSampleMap: SampleMap,
) => {
  const sampleId = selectedLabel.sampleId;
  const samples = getCandidateSamples(interactionSample, activeSampleMap);

  if (sampleId) {
    return (
      samples.find((candidate) => getSampleId(candidate) === sampleId) ?? null
    );
  }

  return interactionSample;
};

export const resolveSelectedLabelBoundingBox = ({
  selectedLabel,
  interactionSample,
  activeSampleMap,
  useLegacyCoordinates = false,
}: {
  selectedLabel: SelectedLabelLike;
  interactionSample: fos.ModalSample;
  activeSampleMap: SampleMap;
  useLegacyCoordinates?: boolean;
}) => {
  const labelId = getLabelId(selectedLabel);
  const labelPath = getLabelPath(selectedLabel);
  const sample = findSampleForSelection(
    selectedLabel,
    interactionSample,
    activeSampleMap,
  );
  const fieldData = labelPath && sample ? get(sample.sample, labelPath) : null;
  const label = extractSelectedLabel(fieldData, labelId);

  return createLabelBoundingBox(label, { useLegacyCoordinates });
};

export const resolveAnnotationLabelBoundingBox = ({
  selectedLabel,
  renderModel,
  useLegacyCoordinates = false,
}: {
  selectedLabel: SelectedLabelLike | null;
  renderModel: RenderModel;
  useLegacyCoordinates?: boolean;
}) => {
  if (!selectedLabel) {
    return null;
  }

  const labelId = getLabelId(selectedLabel);
  const renderLabel = labelId
    ? [...renderModel.detections, ...renderModel.polylines].find(
        (label) => label._id === labelId,
      )
    : null;

  return createLabelBoundingBox(renderLabel ?? selectedLabel, {
    useLegacyCoordinates,
  });
};

const ensureMinimumCameraBoxSize = (box: Box3) => {
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());

  if (
    !isFiniteVector3(center) ||
    !isFiniteVector3(size) ||
    Math.max(size.x, size.y, size.z) >= MIN_LABEL_CROP_SIZE
  ) {
    return box;
  }

  return new Box3().setFromCenterAndSize(
    center,
    new Vector3(MIN_LABEL_CROP_SIZE, MIN_LABEL_CROP_SIZE, MIN_LABEL_CROP_SIZE),
  );
};

export const getUnionBoundingBox = (boxes: Box3[]) => {
  if (boxes.length === 0) {
    return null;
  }

  const box = boxes.reduce(
    (acc, current) => acc.union(current),
    boxes[0].clone(),
  );

  return ensureMinimumCameraBoxSize(box);
};

export const getSelectedLabelsBoundingBox = ({
  selectedLabels,
  interactionSample,
  activeSampleMap,
  useLegacyCoordinates = false,
}: {
  selectedLabels: SelectedLabelLike[];
  interactionSample: fos.ModalSample;
  activeSampleMap: SampleMap;
  useLegacyCoordinates?: boolean;
}) => {
  const boxes = selectedLabels
    .map((selectedLabel) =>
      resolveSelectedLabelBoundingBox({
        selectedLabel,
        interactionSample,
        activeSampleMap,
        useLegacyCoordinates,
      }),
    )
    .filter((box): box is Box3 => Boolean(box));

  return getUnionBoundingBox(boxes);
};
