import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import type {
  CuboidTransformData,
  PolylinePointTransformData,
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "../annotation/types";
import { isValidPolylineSegment } from "../utils";
import type { OverlayLabel } from "./loader";

/**
 * Reconciles a raw detection overlay with staged transform data.
 * Staged transforms override the original values.
 */
export function reconcileDetection(
  overlay: OverlayLabel,
  stagedTransform?: CuboidTransformData
): ReconciledDetection3D {
  return {
    ...overlay,
    ...(stagedTransform ?? {}),
  } as ReconciledDetection3D;
}

/**
 * Reconciles a raw polyline overlay with staged transform data.
 * Staged segments override the original points3d.
 * Also coerces string booleans from misc data.
 */
export function reconcilePolyline(
  overlay: OverlayLabel & { points3d: [number, number, number][][] },
  stagedTransform?: PolylinePointTransformData
): ReconciledPolyline3D {
  // Staged segments take precedence over original points3d
  let finalPoints3d = stagedTransform?.segments
    ? stagedTransform.segments.map((seg) => seg.points)
    : overlay.points3d;

  // Filter out invalid segments
  if (finalPoints3d) {
    finalPoints3d = finalPoints3d.filter(isValidPolylineSegment);
  }

  return {
    ...overlay,
    ...coerceStringBooleans(stagedTransform?.misc ?? {}),
    points3d: finalPoints3d,
  } as ReconciledPolyline3D;
}

/**
 * Creates a new detection from staged transform data.
 * Used for newly created detections that don't exist in sample data yet.
 */
export function createNewDetection(
  labelId: string,
  transformData: CuboidTransformData,
  currentSampleId: string,
  path: string
): ReconciledDetection3D {
  return {
    _id: labelId,
    _cls: "Detection",
    type: "Detection",
    path,
    ...coerceStringBooleans(transformData ?? {}),
    location: transformData.location,
    dimensions: transformData.dimensions,
    rotation: transformData.rotation ?? [0, 0, 0],
    selected: false,
    sampleId: currentSampleId,
    tags: [],
    isNew: true,
  } as ReconciledDetection3D;
}

/**
 * Creates a new polyline from staged transform data.
 * Used for newly created polylines that don't exist in sample data yet.
 * Returns null if the transform data doesn't have valid segments.
 */
export function createNewPolyline(
  labelId: string,
  transformData: PolylinePointTransformData,
  currentSampleId: string
): ReconciledPolyline3D | null {
  if (!transformData.segments || transformData.segments.length === 0) {
    return null;
  }

  const validPoints3d = transformData.segments
    .map((segment) => segment.points)
    .filter(isValidPolylineSegment);

  if (validPoints3d.length === 0) {
    return null;
  }

  return {
    _id: labelId,
    _cls: "Polyline",
    type: "Polyline",
    path: transformData.path ?? "",
    label: transformData.label,
    selected: false,
    sampleId: currentSampleId,
    tags: [],
    points3d: validPoints3d,
    ...coerceStringBooleans(transformData.misc ?? {}),
    isNew: true,
  } as ReconciledPolyline3D;
}
