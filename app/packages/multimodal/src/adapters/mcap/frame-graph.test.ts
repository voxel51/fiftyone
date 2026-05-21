import { describe, expect, it } from "vitest";
import {
  createMcapStaticTransformGraph,
  resolveMcapStaticFrameTransform,
  selectMcapFixedFrame,
} from "./frame-graph";
import type { McapStaticTransform } from "./types";

describe("MCAP static frame graph", () => {
  it("prefers semantic global fixed frames connected to the source frame", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [
        transform("world", "base_link"),
        transform("base_link", "lidar"),
        transform("odom", "camera"),
      ],
    });

    expect(
      selectMcapFixedFrame({
        graph,
        sourceFrameIds: ["lidar"],
      })
    ).toBe("world");
  });

  it("uses an explicit fixed frame before semantic defaults", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [transform("map", "lidar")],
    });

    expect(
      selectMcapFixedFrame({
        explicitFrameId: "custom_frame",
        graph,
        sourceFrameIds: ["lidar"],
      })
    ).toBe("custom_frame");
  });

  it("falls back to native rendering when no semantic frame is connected", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [transform("sensor_mount", "lidar")],
    });

    expect(
      selectMcapFixedFrame({
        graph,
        sourceFrameIds: ["lidar"],
      })
    ).toBeUndefined();
  });

  it("composes child-to-parent static transforms", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [
        transform("map", "base_link", { x: 1, y: 0, z: 0 }),
        transform("base_link", "lidar", { x: 0, y: 2, z: 0 }),
      ],
    });

    expect(
      resolveMcapStaticFrameTransform({
        graph,
        sourceFrameId: "lidar",
        targetFrameId: "map",
      })
    ).toMatchObject({
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      sourceFrameId: "lidar",
      targetFrameId: "map",
      translation: { x: 1, y: 2, z: 0 },
    });
  });

  it("resolves inverse parent-to-child static transforms", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [transform("map", "lidar", { x: 1, y: 2, z: 3 })],
    });

    expect(
      resolveMcapStaticFrameTransform({
        graph,
        sourceFrameId: "map",
        targetFrameId: "lidar",
      })
    ).toMatchObject({
      sourceFrameId: "map",
      targetFrameId: "lidar",
      translation: { x: -1, y: -2, z: -3 },
    });
  });

  it("returns null when no static path connects the frames", () => {
    const graph = createMcapStaticTransformGraph({
      transforms: [transform("map", "lidar")],
    });

    expect(
      resolveMcapStaticFrameTransform({
        graph,
        sourceFrameId: "camera",
        targetFrameId: "map",
      })
    ).toBeNull();
  });
});

function transform(
  parentFrameId: string,
  childFrameId: string,
  translation = { x: 0, y: 0, z: 0 }
): McapStaticTransform {
  return {
    childFrameId,
    parentFrameId,
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    sourceChannelId: 1,
    sourceTopic: "/tf_static",
    translation,
  };
}
