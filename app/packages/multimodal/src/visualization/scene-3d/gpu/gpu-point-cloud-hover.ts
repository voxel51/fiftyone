import type { PointCloudRenderPayload } from "../../../ir";
import type { PointCloudPanelLayer } from "../types";
import {
  gpuPointCloudColorAtSample,
  type ResolvedGpuPointCloudColor,
} from "./gpu-point-cloud-color";
import { gpuPointCloudSampleIndex } from "./gpu-point-cloud-sampling";

/** Canonical payload state needed to decode one rendered hover hit. */
export interface GpuPointCloudHoverData {
  readonly color: ResolvedGpuPointCloudColor;
  readonly payload: PointCloudRenderPayload;
  readonly renderedPointCount: number;
}

/** Source identity and color resolved from one rendered point. */
export interface ResolvedGpuPointCloudHover {
  readonly color: readonly [number, number, number] | null;
  readonly pointIndex: number;
  readonly sampleIndex: number;
}

/** Maps a rendered WebGL vertex back into canonical payload hover space. */
export function resolveGpuPointCloudRenderedHover(
  layer: PointCloudPanelLayer,
  data: GpuPointCloudHoverData,
  renderedIndex: number,
): ResolvedGpuPointCloudHover | null {
  const sampleIndex = gpuPointCloudSampleIndex(
    data.payload.sampledPointCount,
    data.renderedPointCount,
    renderedIndex,
  );
  if (sampleIndex === null) {
    return null;
  }
  const pointIndex = sourcePointIndexForGpuSample(
    layer,
    data.payload,
    sampleIndex,
  );
  if (pointIndex === null) {
    return null;
  }
  return {
    color: gpuPointCloudColorAtSample(data.color, data.payload, sampleIndex),
    pointIndex,
    sampleIndex,
  };
}

/** Maps one canonical GPU sample to its source point index. */
export function sourcePointIndexForGpuSample(
  layer: PointCloudPanelLayer,
  payload: PointCloudRenderPayload,
  sampleIndex: number,
): number | null {
  if (
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= payload.sampledPointCount ||
    sampleIndex >= payload.sourceIndices.length
  ) {
    return null;
  }
  // sourceIndices is the worker-built identity bridge from the bounded GPU
  // sample back to its packed source record.
  const sourceIndex = payload.sourceIndices[sampleIndex];
  const sourcePointCount = payload.sourcePointCount ?? layer.frame.pointCount;
  return sourceIndex < sourcePointCount ? sourceIndex : null;
}
