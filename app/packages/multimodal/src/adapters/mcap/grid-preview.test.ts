import { describe, expect, it, vi } from "vitest";
import type {
  EncodedImageVisualization,
  ImageAnnotationsVisualization,
  PointCloudVisualization,
} from "../../decoders";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type { StreamInventory } from "../../schemas/v1";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS,
  chooseCameraSelection,
  decodeGridPreview,
  type McapGridPreviewFrame,
} from "./grid-preview";
import { chooseAnnotationTopic } from "./topic-matching";
import { streamTopics } from "./stream-topics";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapSynchronizedMessageWindow,
} from "./types";

describe("MCAP grid preview", () => {
  it("returns an empty no-stream state and caches the missing selection", async () => {
    const client = createClient({
      readTopics: vi.fn(async () => []),
    });
    const entry = { client };

    const first = await decodeGridPreview(entry, { source: createSource() });
    const second = await decodeGridPreview(entry, { source: createSource() });

    expect(first.state).toMatchObject({
      frame: null,
      hasPreviewTopics: false,
      streamTopic: null,
      status: "empty",
    });
    expect(second.state.status).toBe("empty");
    expect(client.readTopics).toHaveBeenCalledTimes(1);
  });

  it("reads an image frame and reuses the cached stream selection", async () => {
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      yield createImageMessage(request.topics?.[0] ?? "/camera", [1, 2, 3], 7n);
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [createTopic("/camera/front")]),
    });
    const entry = { client };

    const first = await decodeGridPreview(entry, { source: createSource() });
    const second = await decodeGridPreview(entry, {
      source: createSource(),
      startTimeNs: first.nextStartTimeNs,
    });

    expect(first.state.status).toBe("ready");
    expect(imageFrame(first.state.frame)?.image.bytes[0]).toBe(1);
    expect(first.nextStartTimeNs).toBe(8n);
    expect(second.state.status).toBe("ready");
    expect(client.readTopics).toHaveBeenCalledTimes(1);
    expect(readDecodedMessages.mock.calls[1]?.[0]).toMatchObject({
      startTimeNs: 8n,
      topics: ["/camera/front"],
    });
  });

  it("pairs exact camera annotations with a nearby image frame", async () => {
    const imageMessage = createImageMessage("/CAM_FRONT/image_rect_compressed");
    const annotationMessage = createAnnotationMessage(
      "/CAM_FRONT/annotations",
      20n
    );
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      if (request.topics?.[0] === "/CAM_FRONT/annotations") {
        yield annotationMessage;
      }
    });
    const readSynchronizedMessages = vi.fn(async () =>
      createWindow(20n, "/CAM_FRONT/image_rect_compressed", imageMessage)
    );
    const client = createClient({
      readDecodedMessages,
      readSynchronizedMessages,
      readTopics: vi.fn(async () => [
        createTopic("/CAM_FRONT/image_rect_compressed"),
        createTopic("/CAM_FRONT/annotations", "foxglove.ImageAnnotations"),
      ]),
    });

    const result = await decodeGridPreview(
      { client },
      { source: createSource() }
    );

    expect(result.state.status).toBe("ready");
    expect(result.delayMs).toBe(MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS);
    expect(imageFrame(result.state.frame)?.annotations?.texts[0]?.text).toBe(
      "car"
    );
    expect(imageFrame(result.state.frame)?.image.bytes[0]).toBe(1);
    expect(readSynchronizedMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        timeNs: 20n,
        topics: ["/CAM_FRONT/image_rect_compressed"],
      })
    );
  });

  it("falls back to image-only frames when selected annotations are unavailable", async () => {
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      if (request.topics?.[0] === "/CAM_FRONT/image_rect_compressed") {
        yield createImageMessage(
          "/CAM_FRONT/image_rect_compressed",
          [4, 5, 6],
          30n
        );
      }
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [
        createTopic("/CAM_FRONT/image_rect_compressed"),
        createTopic("/CAM_FRONT/annotations", "foxglove.ImageAnnotations"),
      ]),
    });

    const result = await decodeGridPreview(
      { client },
      { source: createSource() }
    );

    expect(result.state.status).toBe("ready");
    expect(imageFrame(result.state.frame)?.annotations).toBeNull();
    expect(imageFrame(result.state.frame)?.image.bytes[0]).toBe(4);
    expect(result.nextStartTimeNs).toBe(31n);
    expect(
      readDecodedMessages.mock.calls.map(([request]) => request.topics)
    ).toEqual([
      ["/CAM_FRONT/annotations"],
      ["/CAM_FRONT/image_rect_compressed"],
    ]);
  });

  it("returns empty with stream topics when the selected stream has no frame", async () => {
    const client = createClient({
      readDecodedMessages: vi.fn(async function* () {
        for (const item of [] as never[]) {
          yield item;
        }
      }),
      readTopics: vi.fn(async () => [createTopic("/camera/front")]),
    });

    const result = await decodeGridPreview(
      { client },
      { source: createSource() }
    );

    expect(result.state).toMatchObject({
      frame: null,
      hasPreviewTopics: true,
      streamTopic: "/camera/front",
      status: "empty",
    });
  });

  it("uses an explicit selected image stream when it is available", async () => {
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      yield createImageMessage(request.topics?.[0] ?? "/camera", [8, 9], 40n);
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [
        createTopic("/camera/front"),
        createTopic("/camera/back"),
      ]),
    });

    const result = await decodeGridPreview(
      { client },
      {
        selectedStreamTopic: "/camera/back",
        source: createSource(),
      }
    );

    expect(result.state).toMatchObject({
      streamTopic: "/camera/back",
      streamTopics: ["/camera/front", "/camera/back"],
      status: "ready",
    });
    expect(imageFrame(result.state.frame)?.image.bytes[0]).toBe(8);
    expect(readDecodedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ["/camera/back"] })
    );
  });

  it("returns unavailable when an explicit selected stream is missing", async () => {
    const readDecodedMessages = vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [createTopic("/camera/front")]),
    });

    const result = await decodeGridPreview(
      { client },
      {
        selectedStreamTopic: "/camera/back",
        source: createSource(),
      }
    );

    expect(result.state).toEqual({
      error: null,
      frame: null,
      hasPreviewTopics: true,
      streamTopic: "/camera/back",
      streamTopics: ["/camera/front"],
      status: "unavailable",
    });
    expect(readDecodedMessages).not.toHaveBeenCalled();
  });

  it("uses a point-cloud stream when auto has no image stream", async () => {
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      yield createPointCloudMessage(
        request.topics?.[0] ?? "/lidar/points",
        [1, 2, 3],
        50n
      );
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [
        createTopic("/lidar/points", "foxglove.PointCloud"),
      ]),
    });

    const result = await decodeGridPreview(
      { client },
      { source: createSource() }
    );

    expect(result.state).toMatchObject({
      streamTopic: "/lidar/points",
      streamTopics: ["/lidar/points"],
      status: "ready",
    });
    expect(pointCloudFrame(result.state.frame)?.pointCloud.positions[0]).toBe(
      1
    );
    expect(readDecodedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ["/lidar/points"] })
    );
  });

  it("uses an explicit selected point-cloud stream", async () => {
    const readDecodedMessages = vi.fn(async function* (
      request: Parameters<McapResourceClient["readDecodedMessages"]>[0]
    ) {
      yield createPointCloudMessage(
        request.topics?.[0] ?? "/lidar/rear",
        [4, 5, 6],
        60n
      );
    });
    const client = createClient({
      readDecodedMessages,
      readTopics: vi.fn(async () => [
        createTopic("/camera/front"),
        createTopic("/lidar/rear", "foxglove.PointCloud"),
      ]),
    });

    const result = await decodeGridPreview(
      { client },
      {
        selectedStreamTopic: "/lidar/rear",
        source: createSource(),
      }
    );

    expect(result.state).toMatchObject({
      streamTopic: "/lidar/rear",
      streamTopics: ["/camera/front", "/lidar/rear"],
      status: "ready",
    });
    expect(pointCloudFrame(result.state.frame)?.pointCloud.positions[0]).toBe(
      4
    );
  });

  it("classifies image and annotation topics from schema metadata", () => {
    expect(
      streamTopics([
        createTopic("/camera/front"),
        createTopic("/camera/front/annotations", "foxglove.ImageAnnotations"),
        createTopic("/lidar/points", "foxglove.PointCloud"),
        createTopic("/tf", "foxglove.FrameTransform"),
      ])
    ).toEqual({
      annotations: ["/camera/front/annotations"],
      image: ["/camera/front"],
      pointCloud: ["/lidar/points"],
      previewable: ["/camera/front", "/lidar/points"],
    });
  });

  it("ignores point-cloud-like schemas without a supported decoder", () => {
    expect(
      streamTopics([
        createTopic(
          "/radar/points",
          "sensor_msgs/msg/PointCloud2",
          "cdr",
          "ros2msg"
        ),
        createTopic("/radar/custom", "example.RadarPointCloud"),
        createTopic("/tf", "foxglove.FrameTransform"),
      ])
    ).toEqual({
      annotations: [],
      image: [],
      pointCloud: [],
      previewable: [],
    });
  });

  it("deterministically selects the first camera and its matching annotations", () => {
    const selection = chooseCameraSelection({
      annotations: ["/CAM_BACK/annotations", "/CAM_FRONT/annotations"],
      image: [
        "/CAM_FRONT/image_rect_compressed",
        "/CAM_BACK/image_rect_compressed",
      ],
      pointCloud: [],
      previewable: [
        "/CAM_FRONT/image_rect_compressed",
        "/CAM_BACK/image_rect_compressed",
      ],
    });

    expect(selection).toEqual({
      annotationTopic: "/CAM_FRONT/annotations",
      kind: "image",
      streamTopic: "/CAM_FRONT/image_rect_compressed",
    });
  });

  it("prefers nested camera annotation siblings", () => {
    expect(
      chooseAnnotationTopic("/camera/front/image_rect_compressed", [
        "/camera/annotations",
        "/camera/front/annotations",
      ])
    ).toBe("/camera/front/annotations");
  });

  it("does not match camera prefixes across path segment boundaries", () => {
    expect(
      chooseAnnotationTopic("/cam/image_rect_compressed", [
        "/cam_front/annotations",
      ])
    ).toBeNull();
  });
});

function createClient(
  overrides: Partial<McapResourceClient> = {}
): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readFrameTransformBootstrap: vi.fn(),
    readFrameTransformWindow: vi.fn(),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(async () => []),
    readTopicTimeBounds: vi.fn(async () => []),
    ...overrides,
  };
}

function createSource(): ByteSourceDescriptor {
  return {
    sourceId: "sample-id",
    url: "memory://sample.mcap",
  };
}

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

function createImageMessage(
  topic: string,
  bytes = [1, 2, 3],
  timelineTimeNs = 10n
): McapDecodedMessage {
  const visualization: EncodedImageVisualization = {
    bytes: new Uint8Array(bytes),
    kind: VISUALIZATION_KIND.ENCODED_IMAGE,
  };

  return createDecodedMessage(topic, "foxglove.CompressedImage", {
    visualization,
    timelineTimeNs,
  });
}

function createAnnotationMessage(
  topic: string,
  timelineTimeNs = 10n
): McapDecodedMessage {
  const visualization: ImageAnnotationsVisualization = {
    circles: [],
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    points: [],
    texts: [
      {
        backgroundColor: null,
        fontSize: 12,
        position: [1, 2],
        text: "car",
        textColor: null,
      },
    ],
  };

  return createDecodedMessage(topic, "foxglove.ImageAnnotations", {
    visualization,
    timelineTimeNs,
  });
}

function createPointCloudMessage(
  topic: string,
  positions: readonly number[],
  timelineTimeNs = 10n
): McapDecodedMessage {
  const visualization: PointCloudVisualization = {
    fields: [],
    kind: VISUALIZATION_KIND.POINT_CLOUD,
    pointCount: Math.floor(positions.length / 3),
    positions: new Float32Array(positions),
  };

  return createDecodedMessage(topic, "foxglove.PointCloud", {
    visualization,
    timelineTimeNs,
  });
}

function imageFrame(
  frame: McapGridPreviewFrame | null
): Extract<McapGridPreviewFrame, { kind: "image" }> | null {
  return frame?.kind === "image" ? frame : null;
}

function pointCloudFrame(
  frame: McapGridPreviewFrame | null
): Extract<McapGridPreviewFrame, { kind: "point-cloud" }> | null {
  return frame?.kind === "point-cloud" ? frame : null;
}

function createDecodedMessage(
  topic: string,
  schema: string,
  {
    timelineTimeNs,
    visualization,
  }: {
    readonly timelineTimeNs: bigint;
    readonly visualization: McapDecodedMessage["decoded"]["output"]["visualization"];
  }
): McapDecodedMessage {
  return {
    activeTimeline: "log",
    channelId: 1,
    decoded: {
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: {
        visualization,
      },
      payload: {
        encoding: "protobuf",
        schema,
        schemaEncoding: "protobuf",
      },
    },
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    sequence: 1,
    timelineTimeNs,
    topic,
  };
}

function createWindow(
  timeNs: bigint,
  topic: string,
  message: McapDecodedMessage
): McapSynchronizedMessageWindow {
  return {
    activeTimeline: "log",
    endTimeNs: timeNs,
    messages: [message],
    messagesByTopic: {
      [topic]: [message],
    },
    startTimeNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}
