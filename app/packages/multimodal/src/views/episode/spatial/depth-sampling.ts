import { atom, useAtomValue, useSetAtom } from "jotai";

import type { RawImageVisualization } from "../../../ir";
import {
  projectCameraPoint,
  unprojectCameraPixel,
  type CameraModel,
} from "./camera-geometry/camera-model";

const MINIMUM_RAY_Z = 1e-9;

/** One valid depth-image sample expressed in its camera frame. */
export interface DepthSample {
  readonly depthMeters: number;
  readonly pixel: readonly [number, number];
  readonly position: readonly [number, number, number];
}

/** Depth-image point currently under the pointer in an episode image tile. */
export interface DepthHover extends DepthSample {
  readonly cameraFrameId: string;
  readonly contentTimeNs: bigint;
  readonly imageStream: string;
}

/** Modal-local depth hover shared by image and 3D tiles. */
const depthHoverAtom = atom<DepthHover | null>(null);

/** Reads the depth sample currently hovered in an image tile. */
export function useDepthHover(): DepthHover | null {
  return useAtomValue(depthHoverAtom);
}

/** Returns the setter for the modal-local depth hover. */
export function useSetDepthHover() {
  return useSetAtom(depthHoverAtom);
}

/**
 * Samples one displayed depth-image pixel and unprojects it into camera space.
 * Depth encodings measure camera Z, so off-axis rays scale by `depth / ray.z`
 * rather than by their Euclidean length.
 */
export function depthSampleAtDisplayPixel({
  displayCameraModel,
  frame,
  sourceCameraModel,
  u,
  v,
}: {
  readonly displayCameraModel: CameraModel;
  readonly frame: RawImageVisualization;
  readonly sourceCameraModel: CameraModel;
  readonly u: number;
  readonly v: number;
}): DepthSample | null {
  if (
    !frame.depth ||
    frame.depth.values.length !== frame.width * frame.height ||
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < 0 ||
    v < 0 ||
    u > displayCameraModel.width - 1 ||
    v > displayCameraModel.height - 1
  ) {
    return null;
  }

  const sourcePixel = displayPixelInSourceModel(
    displayCameraModel,
    sourceCameraModel,
    u,
    v,
  );
  if (!sourcePixel) {
    return null;
  }
  const x = Math.round(sourcePixel[0]);
  const y = Math.round(sourcePixel[1]);
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    return null;
  }

  const rawDepth = frame.depth.values[y * frame.width + x];
  const depthMeters = rawDepth * frame.depth.metersPerUnit;
  if (!(depthMeters > 0) || !Number.isFinite(depthMeters)) {
    return null;
  }

  const ray = unprojectCameraPixel(sourceCameraModel, x, y);
  if (!ray || !(ray[2] > MINIMUM_RAY_Z)) {
    return null;
  }
  const scale = depthMeters / ray[2];
  const position = [ray[0] * scale, ray[1] * scale, depthMeters] as const;
  if (!position.every(Number.isFinite)) {
    return null;
  }

  return { depthMeters, pixel: [x, y], position };
}

function displayPixelInSourceModel(
  displayCameraModel: CameraModel,
  sourceCameraModel: CameraModel,
  u: number,
  v: number,
): readonly [number, number] | null {
  if (displayCameraModel === sourceCameraModel) {
    return [u, v];
  }
  const ray = unprojectCameraPixel(displayCameraModel, u, v);
  if (!ray) {
    return null;
  }
  const projected = projectCameraPoint(sourceCameraModel, ray);
  return projected ? [projected.u, projected.v] : null;
}
