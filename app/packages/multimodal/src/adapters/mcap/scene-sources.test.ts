import { describe, expect, it } from "vitest";
import { PlaybackSyncMode, type StreamInventory } from "../../schemas/v1";
import {
  MCAP_SOURCE_TYPE,
  mcapSceneSources,
  mcapStreamPolicies,
} from "./scene-sources";

describe("mcapSceneSources", () => {
  it("classifies supported payloads and omits unsupported topics", () => {
    const sources = mcapSceneSources([
      createTopic("/CAM_FRONT/image_rect_compressed"),
      createTopic("/LIDAR_TOP", "foxglove.PointCloud"),
      createTopic("/CAM_FRONT/annotations", "foxglove.ImageAnnotations"),
      createTopic("/tf", "foxglove.FrameTransform"),
      createTopic("/diagnostics", "diagnostic_msgs/DiagnosticArray", "ros1"),
    ]);

    expect(sources).toEqual([
      {
        id: "/CAM_FRONT/image_rect_compressed",
        type: MCAP_SOURCE_TYPE.IMAGE,
        label: "CAM_FRONT",
      },
      {
        id: "/LIDAR_TOP",
        type: MCAP_SOURCE_TYPE.POINT_CLOUD,
        label: "LIDAR_TOP",
      },
      {
        id: "/CAM_FRONT/annotations",
        type: MCAP_SOURCE_TYPE.IMAGE_ANNOTATION,
        label: "CAM_FRONT/annotations",
      },
    ]);
  });

  it("preserves inventory order so per-type defaults are deterministic", () => {
    const sources = mcapSceneSources([
      createTopic("/camera/front/image_rect_compressed"),
      createTopic("/camera/back/image_rect_compressed"),
    ]);

    expect(sources.map((s) => s.label)).toEqual([
      "camera/front",
      "camera/back",
    ]);
  });

  it("falls back to the full topic when short labels collide", () => {
    const sources = mcapSceneSources([
      createTopic("/camera/front/image_raw"),
      createTopic("/camera/front/image_rect_compressed"),
    ]);

    expect(sources.map((s) => s.label)).toEqual([
      "camera/front/image_raw",
      "camera/front/image_rect_compressed",
    ]);
  });

  it("skips topics without a resolvable name", () => {
    const unnamed = createTopic("/camera/image_rect_compressed");
    unnamed.displayName = "";
    delete unnamed.metadata["mcap.topic"];

    expect(mcapSceneSources([unnamed])).toEqual([]);
  });
});

describe("mcapStreamPolicies", () => {
  it("assigns a sync policy per source type", () => {
    const policies = mcapStreamPolicies(
      mcapSceneSources([
        createTopic("/cam/image_rect_compressed"),
        createTopic("/cam/annotations", "foxglove.ImageAnnotations"),
        createTopic("/lidar", "foxglove.PointCloud"),
      ])
    );

    expect(policies["/cam/image_rect_compressed"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
      toleranceBeforeNs: 120_000_000n,
    });
    expect(policies["/cam/annotations"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
      toleranceBeforeNs: 1_500_000_000n,
    });
    expect(policies["/lidar"]).toEqual({
      mode: PlaybackSyncMode.LATEST,
      toleranceBeforeNs: 200_000_000n,
    });
  });

  it("ignores sources with unknown types", () => {
    expect(
      mcapStreamPolicies([{ id: "/radar", type: "radar", label: "radar" }])
    ).toEqual({});
  });
});

function createTopic(
  topic: string,
  schema = "foxglove.CompressedImage",
  encoding = "protobuf",
  schemaEncoding = "protobuf"
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: topic,
    metadata: {
      "mcap.schema_name": schema,
      "mcap.topic": topic,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding,
      schema,
      schemaEncoding,
    },
    streamId: topic,
  };
}
