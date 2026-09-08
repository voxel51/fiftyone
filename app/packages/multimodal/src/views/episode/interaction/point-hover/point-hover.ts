import type { PointCloudVisualization } from "../../../../ir";
import { decodePointCloudChannelValue } from "../../../../runtime/point-cloud-channel-encoding";
import type { Scene3dHoveredPoint } from "./use-hover-tooltip";

const POINT_COMPONENT_COUNT = 3;

/** Builds the hovered-point payload for a picked decoded index. */
export function hoveredPointForFrame(
  stream: string,
  frame: PointCloudVisualization,
  pointIndex: number,
  sampleIndex?: number,
): Scene3dHoveredPoint | null {
  const payload = frame.renderPayload;
  const resolvedSampleIndex =
    payload &&
    Number.isInteger(sampleIndex) &&
    sampleIndex !== undefined &&
    sampleIndex >= 0 &&
    sampleIndex < payload.sampledPointCount &&
    payload.sourceIndices[sampleIndex] === pointIndex
      ? sampleIndex
      : null;
  const position =
    resolvedSampleIndex !== null && payload
      ? pointPositionAt(payload, resolvedSampleIndex)
      : pointPositionAt(frame, pointIndex);
  if (!position) {
    return null;
  }

  const fields: Record<string, number> = {};
  if (resolvedSampleIndex === null) {
    for (const scalarField of frame.scalarFields ?? []) {
      const value = scalarField.values[pointIndex];
      if (value !== undefined && Number.isFinite(value)) {
        fields[scalarField.name] = value;
      }
    }
  } else {
    for (const scalarField of payload?.scalarFields ?? []) {
      const value = decodePointCloudChannelValue(
        scalarField.encoding,
        scalarField.values[resolvedSampleIndex],
      );
      if (value !== undefined && Number.isFinite(value)) {
        fields[scalarField.name] = value;
      }
    }
  }

  return {
    fields,
    ...(frame.coordinateFrameId ? { frameId: frame.coordinateFrameId } : {}),
    kind: "point",
    pointIndex,
    position,
    stream,
  };
}

function pointPositionAt(
  frame: Pick<PointCloudVisualization, "positions">,
  pointIndex: number,
): readonly [number, number, number] | null {
  if (!Number.isInteger(pointIndex) || pointIndex < 0) {
    return null;
  }
  const offset = pointIndex * POINT_COMPONENT_COUNT;
  if (offset + 2 >= frame.positions.length) {
    return null;
  }

  const x = frame.positions[offset];
  const y = frame.positions[offset + 1];
  const z = frame.positions[offset + 2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return [x, y, z];
}
