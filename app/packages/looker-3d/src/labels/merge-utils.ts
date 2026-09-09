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
  stagedTransform?: CuboidTransformData,
): ReconciledDetection3D {
  return {
    ...overlay,
    data: {
      ...overlay.data,
      ...(stagedTransform ?? {}),
    },
  } as ReconciledDetection3D;
}

/**
 * Reconciles a raw polyline overlay with staged transform data.
 * Staged segments override the original points3d.
 */
export function reconcilePolyline(
  overlay: OverlayLabel & {
    data: { points3d: [number, number, number][][] };
  },
  stagedTransform?: PolylinePointTransformData,
): ReconciledPolyline3D {
  // Staged segments take precedence over original points3d
  let finalPoints3d = stagedTransform?.segments
    ? stagedTransform.segments.map((seg) => seg.points)
    : overlay.data.points3d;

  // Filter out invalid segments
  if (finalPoints3d) {
    finalPoints3d = finalPoints3d.filter(isValidPolylineSegment);
  }

  return {
    ...overlay,
    data: {
      ...overlay.data,
      ...(stagedTransform?.misc ?? {}),
      // structural fields are never `misc`'s to write
      _id: overlay.data._id,
      _cls: overlay.data._cls,
      points3d: finalPoints3d,
    },
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
  path: string,
): ReconciledDetection3D {
  return {
    data: {
      _id: labelId,
      _cls: "Detection",
      ...(transformData ?? {}),
      location: transformData.location,
      dimensions: transformData.dimensions,
      rotation: transformData.rotation ?? [0, 0, 0],
      tags: [],
    },
    path,
    sampleId: currentSampleId,
    ui: { selected: false, isNew: true },
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
  currentSampleId: string,
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
    data: {
      // `misc` first: extras (closed/filled/…) apply, but the structural and
      // validated fields below are never `misc`'s to write
      ...(transformData.misc ?? {}),
      _id: labelId,
      _cls: "Polyline",
      label: transformData.label,
      tags: [],
      points3d: validPoints3d,
    },
    path: transformData.path ?? "",
    sampleId: currentSampleId,
    ui: { selected: false, isNew: true },
  } as ReconciledPolyline3D;
}
