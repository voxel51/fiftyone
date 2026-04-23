import type { Scene3dFrame } from "./archetypes";
import type {
  DecodeBatchResponse,
  MultimodalBinaryManifest,
  MultimodalDecodedBatchImage,
  MultimodalDecodedBatchScene,
  MultimodalEncodedMessage,
  MultimodalEncodedWindowBatch,
  MultimodalRawBufferResponse,
  MultimodalRawBufferResponseStream,
} from "./types";

export const MULTIMODAL_RAW_BUFFER_BINARY_MAGIC = "MMRB";
export const MULTIMODAL_RAW_BUFFER_BINARY_VERSION = 1;
export const MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE =
  "application/x-fiftyone-multimodal-raw-buffer";

const HEADER_LENGTH_BYTES = 9;
const EMPTY_PAYLOAD = new Uint8Array(0);
const IMAGE_BATCH_SCHEMA_NAMES = new Set([
  "sensor_msgs/msg/CompressedImage",
  "foxglove.CompressedImage",
]);
const SCENE_BATCH_SCHEMA_NAMES = new Set([
  "sensor_msgs/msg/PointCloud2",
  "foxglove.PointCloud",
]);

export class MultimodalBinaryTransportUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultimodalBinaryTransportUnsupportedError";
  }
}

export function isBatchDecodedImageSchema(schemaName: string) {
  return IMAGE_BATCH_SCHEMA_NAMES.has(schemaName);
}

export function isBatchDecodedSceneSchema(schemaName: string) {
  return SCENE_BATCH_SCHEMA_NAMES.has(schemaName);
}

export function parseEncodedWindowBatch(
  payloadBuffer: ArrayBuffer
): MultimodalEncodedWindowBatch {
  if (payloadBuffer.byteLength < HEADER_LENGTH_BYTES) {
    throw new MultimodalBinaryTransportUnsupportedError(
      "Binary raw buffer payload is too short"
    );
  }

  const bytes = new Uint8Array(payloadBuffer);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MULTIMODAL_RAW_BUFFER_BINARY_MAGIC) {
    throw new MultimodalBinaryTransportUnsupportedError(
      `Unexpected binary raw buffer magic: ${magic}`
    );
  }

  const version = bytes[4];
  if (version !== MULTIMODAL_RAW_BUFFER_BINARY_VERSION) {
    throw new MultimodalBinaryTransportUnsupportedError(
      `Unsupported binary raw buffer version: ${version}`
    );
  }

  const manifestByteLength = new DataView(payloadBuffer).getUint32(5, true);
  const payloadBaseOffset = HEADER_LENGTH_BYTES + manifestByteLength;
  if (payloadBaseOffset > payloadBuffer.byteLength) {
    throw new MultimodalBinaryTransportUnsupportedError(
      "Binary raw buffer manifest length exceeds response size"
    );
  }

  let manifest: MultimodalBinaryManifest;
  try {
    const manifestText = new TextDecoder().decode(
      new Uint8Array(payloadBuffer, HEADER_LENGTH_BYTES, manifestByteLength)
    );
    manifest = JSON.parse(manifestText) as MultimodalBinaryManifest;
  } catch (error) {
    throw new MultimodalBinaryTransportUnsupportedError(
      `Failed to parse binary raw buffer manifest: ${String(error)}`
    );
  }

  if (!Array.isArray(manifest.streams)) {
    throw new MultimodalBinaryTransportUnsupportedError(
      "Binary raw buffer manifest is missing streams"
    );
  }

  return {
    ...manifest,
    payloadBaseOffset,
    payloadBuffer,
  };
}

export function materializeRawBufferResponse(
  batch: Omit<MultimodalEncodedWindowBatch, "payloadBuffer">,
  decodedBatch: DecodeBatchResponse
): MultimodalRawBufferResponse {
  const decodedImageMap = new Map(
    decodedBatch.decodedImages.map((entry) => [
      entry.messageId,
      materializeDecodedImage(entry),
    ])
  );
  const decodedSceneMap = new Map(
    decodedBatch.decodedScenes.map((entry) => [
      entry.messageId,
      materializeDecodedScene(entry),
    ])
  );

  return {
    sceneId: batch.sceneId,
    window: batch.window,
    streams: batch.streams.map((stream) =>
      materializeRawBufferStream(
        stream,
        batch.payloadBaseOffset,
        decodedBatch.payloadBuffer,
        decodedImageMap,
        decodedSceneMap
      )
    ),
  };
}

function materializeRawBufferStream(
  stream: MultimodalEncodedWindowBatch["streams"][number],
  payloadBaseOffset: number,
  payloadBuffer: ArrayBuffer,
  decodedImageMap: Map<
    string,
    {
      messageId: string;
      format: string;
      frameId: string;
      compressedBytes: Uint8Array;
    }
  >,
  decodedSceneMap: Map<
    string,
    {
      messageId: string;
      frame: Scene3dFrame;
    }
  >
): MultimodalRawBufferResponseStream {
  const shouldBatchDecodeImages = isBatchDecodedImageSchema(stream.schemaName);
  const shouldBatchDecodeScenes = isBatchDecodedSceneSchema(stream.schemaName);

  return {
    streamId: stream.streamId,
    schemaName: stream.schemaName,
    messageEncoding: stream.messageEncoding,
    messages: stream.messages.map((message) =>
      materializeRawMessage(
        message,
        payloadBaseOffset,
        payloadBuffer,
        shouldBatchDecodeImages || shouldBatchDecodeScenes
      )
    ),
    prefetchedImageMessages: shouldBatchDecodeImages
      ? stream.messages.map((message) => {
          const decoded = decodedImageMap.get(message.messageId);
          if (!decoded) {
            throw new Error(
              `Missing prefetched image decode for ${message.messageId}`
            );
          }
          return decoded;
        })
      : undefined,
    prefetchedSceneMessages: shouldBatchDecodeScenes
      ? stream.messages.map((message) => {
          const decoded = decodedSceneMap.get(message.messageId);
          if (!decoded) {
            throw new Error(
              `Missing prefetched 3D decode for ${message.messageId}`
            );
          }
          return decoded;
        })
      : undefined,
  };
}

function materializeRawMessage(
  message: MultimodalEncodedMessage,
  payloadBaseOffset: number,
  payloadBuffer: ArrayBuffer,
  omitPayload: boolean
) {
  return {
    messageId: message.messageId,
    syncTimestampNs: message.syncTimestampNs,
    logTimeNs: message.logTimeNs,
    publishTimeNs: message.publishTimeNs,
    payload: omitPayload
      ? EMPTY_PAYLOAD
      : new Uint8Array(
          payloadBuffer,
          payloadBaseOffset + message.payloadOffset,
          message.payloadLength
        ),
  };
}

function materializeDecodedImage(entry: MultimodalDecodedBatchImage) {
  return {
    messageId: entry.messageId,
    format: entry.format,
    frameId: entry.frameId,
    compressedBytes: new Uint8Array(
      entry.compressedBytes,
      entry.compressedBytesByteOffset,
      entry.compressedBytesByteLength
    ),
  };
}

function materializeDecodedScene(entry: MultimodalDecodedBatchScene): {
  messageId: string;
  frame: Scene3dFrame;
} {
  return {
    messageId: entry.messageId,
    frame: {
      id: entry.messageId,
      pointCount: entry.pointCount,
      bounds: entry.bounds,
      frameId: entry.frameId,
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: entry.frameId,
          pointCount: entry.pointCount,
          positions: new Float32Array(
            entry.positions,
            entry.positionsByteOffset,
            entry.positionsByteLength / Float32Array.BYTES_PER_ELEMENT
          ),
          intensity: entry.intensity
            ? new Float32Array(
                entry.intensity,
                entry.intensityByteOffset,
                entry.intensityByteLength / Float32Array.BYTES_PER_ELEMENT
              )
            : null,
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
    },
  };
}
