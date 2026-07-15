import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeJsonRecord } from "./decode";
import { jsonPoseDecoder } from "./pose";

const utf8 = new TextEncoder();

describe("decodeJsonRecord", () => {
  it("parses UTF-8 JSON objects", () => {
    expect(decodeJsonRecord(utf8.encode('{"a": 1}'))).toEqual({ a: 1 });
  });

  it("rejects non-object payloads and invalid JSON", () => {
    expect(() => decodeJsonRecord(utf8.encode("[1, 2]"))).toThrow(
      "JSON message is not an object",
    );
    expect(() => decodeJsonRecord(utf8.encode("null"))).toThrow(
      "JSON message is not an object",
    );
    expect(() => decodeJsonRecord(utf8.encode("{nope"))).toThrow();
  });
});

describe("jsonPoseDecoder", () => {
  it("declares the JSON Pose payload descriptor", () => {
    expect(jsonPoseDecoder.payload).toMatchObject({
      encoding: "json",
      schema: "Pose",
      schemaEncoding: "jsonschema",
    });
  });

  it("decodes NuScenes-style odometry bodies", () => {
    // Field names match the real /odom payloads in nuscenes2mcap exports.
    const { attributes, visualization } = jsonPoseDecoder.decode(
      utf8.encode(
        JSON.stringify({
          accel: { x: 0.29, y: 0.46, z: 9.81 },
          orientation: { w: 0.999, x: 0, y: 0, z: -0.032 },
          pos: { x: 995.06, y: 1375.55, z: 0 },
          rotation_rate: { x: -0.003, y: 0.012, z: 0.051 },
          vel: { x: 6.45, y: 0, z: 0 },
        }),
      ),
      { sourceTimestamps: { logTime: 42n }, timeRangeStartKey: "logTime" },
    );

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(visualization.position).toEqual([995.06, 1375.55, 0]);
    expect(visualization.quaternion).toEqual([0, 0, -0.032, 0.999]);
    expect(visualization.velocity).toEqual([6.45, 0, 0]);
    expect(visualization.acceleration).toEqual([0.29, 0.46, 9.81]);
    expect(visualization.angularVelocity).toEqual([-0.003, 0.012, 0.051]);
    expect(visualization.coordinateFrameId).toBeUndefined();
    expect(attributes?.speed).toBeCloseTo(6.45);
  });

  it("accepts alias field names", () => {
    const { visualization } = jsonPoseDecoder.decode(
      utf8.encode(
        JSON.stringify({
          angular_velocity: { x: 1, y: 2, z: 3 },
          position: { x: 1, y: 2, z: 3 },
          quaternion: { w: 1, x: 0, y: 0, z: 0 },
          velocity: { x: 4, y: 5, z: 6 },
        }),
      ),
      {},
    );

    if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(visualization.position).toEqual([1, 2, 3]);
    expect(visualization.velocity).toEqual([4, 5, 6]);
    expect(visualization.angularVelocity).toEqual([1, 2, 3]);
  });

  it("defaults a missing orientation to identity", () => {
    const { visualization } = jsonPoseDecoder.decode(
      utf8.encode(JSON.stringify({ pos: { x: 1, y: 2, z: 3 } })),
      {},
    );

    if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(visualization.quaternion).toEqual([0, 0, 0, 1]);
    expect(visualization.velocity).toBeUndefined();
  });

  it("degrades instead of throwing on shape mismatches", () => {
    // "Pose" is an unnamespaced schema name; a throwing decoder would
    // reject whole synchronized playback windows on collision, so bad
    // payloads must yield attributes-only output.
    const noPosition = jsonPoseDecoder.decode(
      utf8.encode(JSON.stringify({ label: "not a pose" })),
      {},
    );
    expect(noPosition.visualization).toBeUndefined();
    expect(noPosition.attributes?.decodeError).toBe(
      "JSON Pose message has no numeric pos/position",
    );

    const badJson = jsonPoseDecoder.decode(utf8.encode("{nope"), {});
    expect(badJson.visualization).toBeUndefined();
    expect(badJson.attributes?.decodeError).toBeTruthy();

    const badNumbers = jsonPoseDecoder.decode(
      utf8.encode(JSON.stringify({ pos: { x: "a", y: 2, z: 3 } })),
      {},
    );
    expect(badNumbers.visualization).toBeUndefined();
  });
});
