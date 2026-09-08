import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { rosNavSatFixDecoders, rosOccupancyGridDecoders } from "./ros/index";
import {
  ROS1_NAV_SAT_FIX_SCHEMA,
  ROS1_OCCUPANCY_GRID_SCHEMA,
  decoderForSchemaEncoding,
  poseRecord,
  ros1Header,
  ros1Message,
  schemaData,
} from "./ros.test-helpers";

describe("ROS navigation decoders", () => {
  it("decodes ros1 NavSatFix into a location visualization", () => {
    const output = decoderForSchemaEncoding(
      rosNavSatFixDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_NAV_SAT_FIX_SCHEMA, {
        altitude: 12.5,
        header: ros1Header({ frameId: "gps", nsec: 14, sec: 13, seq: 2 }),
        latitude: 37.77,
        longitude: -122.42,
        position_covariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
        position_covariance_type: 2,
        status: { service: 1, status: 0 },
      }),
      { schemaData: schemaData(ROS1_NAV_SAT_FIX_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (output.visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(output.visualization).toMatchObject({
      altitude: 12.5,
      coordinateFrameId: "gps",
      fixService: 1,
      fixStatus: 0,
      latitude: 37.77,
      longitude: -122.42,
      positionCovariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
      timestampNs: 13_000_000_014n,
    });
    expect(output.attributes).toMatchObject({
      positionCovarianceType: 2,
      sequence: 2,
      status: { service: 1, status: 0 },
    });
  });

  it("drops NavSatFix covariance when covariance type is unknown", () => {
    const output = decoderForSchemaEncoding(
      rosNavSatFixDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_NAV_SAT_FIX_SCHEMA, {
        altitude: 0,
        header: ros1Header({ frameId: "gps", nsec: 14, sec: 13 }),
        latitude: 37.77,
        longitude: -122.42,
        position_covariance: [1, 0, 0, 0, 2, 0, 0, 0, 3],
        position_covariance_type: 0,
        status: { service: 1, status: 0 },
      }),
      { schemaData: schemaData(ROS1_NAV_SAT_FIX_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (output.visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(output.visualization.positionCovariance).toBeUndefined();
    expect(output.attributes).toMatchObject({
      positionCovarianceType: 0,
    });
  });

  it("decodes ros1 OccupancyGrid into a grid visualization", () => {
    const output = decoderForSchemaEncoding(
      rosOccupancyGridDecoders,
      "ros1msg",
    ).decode(
      ros1Message(ROS1_OCCUPANCY_GRID_SCHEMA, {
        data: [-1, 0, 50, 100],
        header: ros1Header({ frameId: "map", nsec: 16, sec: 15 }),
        info: {
          height: 2,
          map_load_time: { nsec: 18, sec: 17 },
          origin: poseRecord([1, 2, 0], [0, 0, 0, 1]),
          resolution: 0.5,
          width: 2,
        },
      }),
      { schemaData: schemaData(ROS1_OCCUPANCY_GRID_SCHEMA) },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.visualization).toMatchObject({
      cellSize: [0.5, 0.5],
      columnCount: 2,
      coordinateFrameId: "map",
      rowCount: 2,
      timestampNs: 15_000_000_016n,
    });
    expect(Array.from(output.visualization.rgba)).toEqual([
      0, 0, 0, 0, 255, 255, 255, 255, 127, 127, 127, 255, 0, 0, 0, 255,
    ]);
    expect(output.attributes).toMatchObject({
      cellCount: 4,
      mapLoadTimeNs: 17_000_000_018n,
    });
  });
});
