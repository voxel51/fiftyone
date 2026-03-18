import { Quaternion, Vector3 } from "three";
import { isNumericTuple } from "../../../utils";

export type SerializedStaticTransform = {
  translation: [number, number, number] | number[];
  quaternion: [number, number, number, number] | number[];
  source_frame?: string;
  target_frame?: string;
};

export type CameraControlOption = {
  key: string;
  label: string;
  sourceFrame: string;
  targetFrame: string;
  translation: [number, number, number];
  quaternion: [number, number, number, number];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isStaticTransform = (
  value: unknown
): value is SerializedStaticTransform => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNumericTuple(value.translation, 3) && isNumericTuple(value.quaternion, 4)
  );
};

const buildCameraLabel = (sourceFrame: string, targetFrame: string) => {
  if (targetFrame === "world") {
    return sourceFrame;
  }

  return `${sourceFrame} -> ${targetFrame}`;
};

export const buildCameraControlOptionsFromTransforms = (
  transforms: unknown[]
): CameraControlOption[] => {
  const optionsByKey = new Map<string, Omit<CameraControlOption, "label">>();

  transforms.forEach((value) => {
    if (!isStaticTransform(value) || !value.source_frame) {
      return;
    }

    const sourceFrame = value.source_frame;
    const targetFrame = value.target_frame || "world";
    const key = `${sourceFrame}::${targetFrame}`;
    if (optionsByKey.has(key)) {
      return;
    }

    optionsByKey.set(key, {
      key,
      sourceFrame,
      targetFrame,
      translation: value.translation as [number, number, number],
      quaternion: value.quaternion as [number, number, number, number],
    });
  });

  const options = Array.from(optionsByKey.values())
    .map((option) => ({
      ...option,
      label: buildCameraLabel(option.sourceFrame, option.targetFrame),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Count occurrences of each label
  const totalCounts = new Map<string, number>();
  for (const option of options) {
    totalCounts.set(option.label, (totalCounts.get(option.label) || 0) + 1);
  }

  // Disambiguate labels that appear more than once: (1), (2), etc.
  const seenCounts = new Map<string, number>();
  return options.map((option) => {
    if ((totalCounts.get(option.label) || 0) <= 1) {
      return option;
    }

    const seen = (seenCounts.get(option.label) || 0) + 1;
    seenCounts.set(option.label, seen);
    return {
      ...option,
      label: `${option.label} (${seen})`,
    };
  });
};

const FALLBACK_TARGET_DISTANCE = 1;
const MIN_LOOK_AT_DISTANCE_SQUARED = 1e-8;

const isFiniteVector3 = (vector: Vector3) =>
  Number.isFinite(vector.x) &&
  Number.isFinite(vector.y) &&
  Number.isFinite(vector.z);

/**
 * Resolves the look-at target for camera selector transitions.
 * Falls back to camera-forward direction when the fallback target would place
 * the camera and target at the same point.
 */
export const resolveCameraSelectorTarget = ({
  translation,
  quaternion,
  fallbackTarget,
}: {
  translation: [number, number, number];
  quaternion: [number, number, number, number];
  fallbackTarget: Vector3;
}): Vector3 => {
  const cameraPosition = new Vector3(
    translation[0],
    translation[1],
    translation[2]
  );

  if (
    isFiniteVector3(fallbackTarget) &&
    cameraPosition.distanceToSquared(fallbackTarget) >
      MIN_LOOK_AT_DISTANCE_SQUARED
  ) {
    return fallbackTarget.clone();
  }

  const cameraForward = new Vector3(0, 0, 1).applyQuaternion(
    new Quaternion(
      quaternion[0],
      quaternion[1],
      quaternion[2],
      quaternion[3]
    ).normalize()
  );

  if (
    isFiniteVector3(cameraForward) &&
    cameraForward.lengthSq() > MIN_LOOK_AT_DISTANCE_SQUARED
  ) {
    return cameraPosition.clone().add(cameraForward);
  }

  return cameraPosition
    .clone()
    .add(new Vector3(0, 0, FALLBACK_TARGET_DISTANCE));
};

export const filterCameraControlOptions = (
  cameraOptions: CameraControlOption[],
  query: string
): CameraControlOption[] => {
  const trimmedQuery = query.trim().toLowerCase();
  const terms =
    trimmedQuery.length > 0 ? trimmedQuery.split(/\s+/).filter(Boolean) : [];

  if (terms.length === 0) {
    return cameraOptions;
  }

  return cameraOptions.filter((option) => {
    const haystack =
      `${option.label} ${option.sourceFrame} ${option.targetFrame} ${option.key}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
};
