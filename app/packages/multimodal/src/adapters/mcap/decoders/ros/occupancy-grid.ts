import type {
  DecodedAttributeValue,
  GridVisualization,
} from "../../../../decoders";
import { resourceHintsForArrayBufferViews } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodePose } from "../foxglove/protobuf/geometry";
import {
  int8ArrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  rosTimestampNs,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_OCCUPANCY_GRID_PAYLOADS } from "./payloads";

const RGBA_COMPONENT_COUNT = 4;
const MAX_OCCUPANCY = 100;
const UINT8_MAX = 255;

/**
 * Decoders for ROS OccupancyGrid messages.
 */
export const rosOccupancyGridDecoders = rosDecodersForPayloads({
  id: "ros.occupancy-grid",
  map(message, context) {
    const header = rosHeader(message);
    const frameId = rosHeaderFrameId(header);
    const messageTimestamp = rosHeaderTimestampNs(header);
    const info = recordField(message, "info");
    if (!info) {
      throw new Error("OccupancyGrid is missing map metadata");
    }

    const width = integerField(info, "width");
    const height = integerField(info, "height");
    const resolution = numberField(info, "resolution", undefined, Number.NaN);
    validateMapInfo({ height, resolution, width });

    const data = int8ArrayField(message, "data");
    const cellCount = width * height;
    if (data.length < cellCount) {
      throw new Error(
        `OccupancyGrid has ${data.length} cells, expected at least ${cellCount}`,
      );
    }

    const rgba = occupancyRgba(data, cellCount);
    const mapLoadTimeNs = rosTimestampNs(recordField(info, "map_load_time"));
    const attributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
      cellCount,
      height,
      resolution,
      width,
    };
    if (mapLoadTimeNs !== undefined) {
      attributes.mapLoadTimeNs = mapLoadTimeNs;
    }

    const visualization: GridVisualization = {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      cellSize: [resolution, resolution],
      columnCount: width,
      kind: VISUALIZATION_KIND.GRID,
      pose: decodePose(recordField(info, "origin")),
      rgba,
      rowCount: height,
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
    };

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(rgba),
      timing: timingFromRosHeader(context, header),
      visualization,
    };
  },
  payloads: ROS_OCCUPANCY_GRID_PAYLOADS,
});

function integerField(record: Record<string, unknown>, field: string): number {
  const value = numberField(record, field, undefined, Number.NaN);
  if (!Number.isInteger(value)) {
    throw new Error(`Field '${field}' is not an integer`);
  }

  return value;
}

function validateMapInfo({
  height,
  resolution,
  width,
}: {
  readonly height: number;
  readonly resolution: number;
  readonly width: number;
}): void {
  if (height <= 0 || width <= 0) {
    throw new Error(`Invalid OccupancyGrid dimensions ${width}x${height}`);
  }
  if (!(resolution > 0) || !Number.isFinite(resolution)) {
    throw new Error(`Invalid OccupancyGrid resolution ${resolution}`);
  }
}

function occupancyRgba(data: Int8Array, cellCount: number): Uint8Array {
  const rgba = new Uint8Array(cellCount * RGBA_COMPONENT_COUNT);
  for (let index = 0; index < cellCount; index++) {
    const occupancy = data[index] ?? -1;
    const offset = index * RGBA_COMPONENT_COUNT;
    if (occupancy < 0) {
      rgba[offset + 3] = 0;
      continue;
    }

    const clamped = Math.max(0, Math.min(MAX_OCCUPANCY, occupancy));
    const shade = UINT8_MAX - Math.round((clamped / MAX_OCCUPANCY) * UINT8_MAX);
    rgba[offset] = shade;
    rgba[offset + 1] = shade;
    rgba[offset + 2] = shade;
    rgba[offset + 3] = UINT8_MAX;
  }

  return rgba;
}
