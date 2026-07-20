import type { PointCloudVisualization } from "../../../decoders";
import type { Episode3dHoveredPoint } from "./use-episode-3d-hover-tooltip";

const POINT_COMPONENT_COUNT = 3;

/** Builds the hovered-point payload for a picked decoded index. */
export function episodeHoveredPointForFrame(
  stream: string,
  frame: PointCloudVisualization,
  pointIndex: number,
): Episode3dHoveredPoint | null {
  const position = pointPositionAt(frame, pointIndex);
  if (!position) {
    return null;
  }

  const fields: Record<string, number> = {};
  for (const scalarField of frame.scalarFields ?? []) {
    const value = scalarField.values[pointIndex];
    if (value !== undefined) {
      fields[scalarField.name] = value;
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
  frame: PointCloudVisualization,
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
