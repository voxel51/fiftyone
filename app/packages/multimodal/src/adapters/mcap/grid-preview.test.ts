import { describe, expect, it, vi } from "vitest";
import type {
  EncodedImageVisualization,
  ImageAnnotationsVisualization,
} from "../../decoders";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type { StreamInventory } from "../../schemas/v1";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS,
  chooseAnnotationTopic,
  chooseCameraSelection,
  decodeGridPreview,
  streamTopics,
} from "./grid-preview";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapSynchronizedMessageWindow,
} from "./types";

describe("MCAP grid preview", () => {
  it("returns an empty no-camera state and caches the missing selection", async () => {
    const client = createClient({
      readTopics: vi.fn(async () => []),
    });
    const entry = { client };

    const first = await decodeGridPreview(entry, { source: createSource() });
    const second = await decodeGridPreview(entry, { source: createSource() });

    expect(first.state).toMatchObject({
      frame: null,
      hasImageTopics: false,
      imageTopic: null,
      status: "empty",
    });
    expect(second.state.status).toBe("empty");
    expect(client.readTopics).toHaveBeenCalledTimes(1);
  });

  it("reads an image frame and reuses the cached camera selection", async () => {
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
    expect(first.state.frame?.image.bytes[0]).toBe(1);
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
    expect(result.state.frame?.annotations?.texts[0]?.text).toBe("car");
    expect(result.state.frame?.image.bytes[0]).toBe(1);
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
    expect(result.state.frame?.annotations).toBeNull();
    expect(result.state.frame?.image.bytes[0]).toBe(4);
    expect(result.nextStartTimeNs).toBe(31n);
    expect(
      readDecodedMessages.mock.calls.map(([request]) => request.topics)
    ).toEqual([
      ["/CAM_FRONT/annotations"],
      ["/CAM_FRONT/image_rect_compressed"],
    ]);
  });

  it("returns empty with image topics when the selected camera has no frame", async () => {
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
      hasImageTopics: true,
      imageTopic: "/camera/front",
      status: "empty",
    });
  });

  it("classifies image and annotation topics from schema metadata", () => {
    expect(
      streamTopics([
        createTopic("/camera/front"),
        createTopic("/camera/front/annotations", "foxglove.ImageAnnotations"),
        createTopic("/tf", "foxglove.FrameTransform"),
      ])
    ).toEqual({
      annotations: ["/camera/front/annotations"],
      image: ["/camera/front"],
    });
  });

  it("deterministically selects the first camera and its matching annotations", () => {
    const selection = chooseCameraSelection({
      annotations: ["/CAM_BACK/annotations", "/CAM_FRONT/annotations"],
      image: [
        "/CAM_FRONT/image_rect_compressed",
        "/CAM_BACK/image_rect_compressed",
      ],
    });

    expect(selection).toEqual({
      annotationTopic: "/CAM_FRONT/annotations",
      imageTopic: "/CAM_FRONT/image_rect_compressed",
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
  schema = "foxglove.CompressedImage"
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
      encoding: "protobuf",
      schema,
      schemaEncoding: "protobuf",
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
