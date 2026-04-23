import { decodeCompressedImagePayload } from "./compressed-image-decoder";
import { decodeFoxgloveCompressedImagePayload } from "./foxglove-compressed-image-decoder";
import { decodeFoxglovePointCloudPayload } from "./foxglove-pointcloud-decoder";
import {
  isBatchDecodedImageSchema,
  isBatchDecodedSceneSchema,
} from "./raw-buffer-binary";
import type {
  DecodeBatchRequest,
  DecodeBatchResponse,
  MultimodalDecodedBatchImage,
  MultimodalDecodedBatchScene,
} from "./types";
import { decodePointCloud2Payload } from "./pointcloud2-decoder";

type WorkerRequest = {
  requestId: number;
  request: DecodeBatchRequest;
};

type WorkerSuccessResponse = {
  requestId: number;
  success: true;
  result: DecodeBatchResponse;
};

type WorkerErrorResponse = {
  requestId: number;
  success: false;
  error: string;
};

function getPayloadView(
  payloadBuffer: ArrayBuffer,
  payloadBaseOffset: number,
  payloadOffset: number,
  payloadLength: number
) {
  return new Uint8Array(
    payloadBuffer,
    payloadBaseOffset + payloadOffset,
    payloadLength
  );
}

function decodeBatchRequest(request: DecodeBatchRequest): DecodeBatchResponse {
  const decodedImages: MultimodalDecodedBatchImage[] = [];
  const decodedScenes: MultimodalDecodedBatchScene[] = [];

  request.batch.streams.forEach((stream) => {
    if (!stream.messages.length) {
      return;
    }

    if (isBatchDecodedImageSchema(stream.schemaName)) {
      stream.messages.forEach((message) => {
        const decoded =
          stream.schemaName === "foxglove.CompressedImage"
            ? decodeFoxgloveCompressedImagePayload(
                getPayloadView(
                  request.payloadBuffer,
                  request.batch.payloadBaseOffset,
                  message.payloadOffset,
                  message.payloadLength
                )
              )
            : decodeCompressedImagePayload(
                getPayloadView(
                  request.payloadBuffer,
                  request.batch.payloadBaseOffset,
                  message.payloadOffset,
                  message.payloadLength
                )
              );
        const compressedBytes =
          decoded.compressedBytes instanceof Uint8Array
            ? decoded.compressedBytes
            : Uint8Array.from(decoded.compressedBytes);

        decodedImages.push({
          messageId: message.messageId,
          format: decoded.format,
          frameId: decoded.frameId,
          compressedBytes: compressedBytes.buffer,
          compressedBytesByteOffset: compressedBytes.byteOffset,
          compressedBytesByteLength: compressedBytes.byteLength,
        });
      });
      return;
    }

    if (isBatchDecodedSceneSchema(stream.schemaName)) {
      stream.messages.forEach((message) => {
        const decoded =
          stream.schemaName === "foxglove.PointCloud"
            ? decodeFoxglovePointCloudPayload(
                getPayloadView(
                  request.payloadBuffer,
                  request.batch.payloadBaseOffset,
                  message.payloadOffset,
                  message.payloadLength
                )
              )
            : decodePointCloud2Payload(
                getPayloadView(
                  request.payloadBuffer,
                  request.batch.payloadBaseOffset,
                  message.payloadOffset,
                  message.payloadLength
                )
              );
        const pointsPrimitive = decoded.frame.primitives[0];
        if (!pointsPrimitive || pointsPrimitive.kind !== "points") {
          throw new Error(
            "Point-cloud batch decoder did not return a points primitive"
          );
        }

        const positions =
          pointsPrimitive.positions instanceof Float32Array
            ? pointsPrimitive.positions
            : Float32Array.from(pointsPrimitive.positions);
        const intensity =
          pointsPrimitive.intensity instanceof Float32Array
            ? pointsPrimitive.intensity
            : pointsPrimitive.intensity
            ? Float32Array.from(pointsPrimitive.intensity)
            : null;

        decodedScenes.push({
          messageId: message.messageId,
          pointCount: decoded.frame.pointCount,
          positions: positions.buffer,
          positionsByteOffset: positions.byteOffset,
          positionsByteLength: positions.byteLength,
          intensity: intensity ? intensity.buffer : null,
          intensityByteOffset: intensity?.byteOffset ?? 0,
          intensityByteLength: intensity?.byteLength ?? 0,
          frameId: pointsPrimitive.frameId ?? decoded.frame.frameId ?? null,
          bounds: decoded.frame.bounds,
        });
      });
    }
  });

  return {
    payloadBuffer: request.payloadBuffer,
    decodedImages,
    decodedScenes,
  };
}

function getWorkerContext() {
  if (
    typeof DedicatedWorkerGlobalScope === "undefined" ||
    typeof self === "undefined" ||
    !(self instanceof DedicatedWorkerGlobalScope)
  ) {
    return null;
  }

  return self as DedicatedWorkerGlobalScope;
}

const workerContext = getWorkerContext();

if (workerContext) {
  workerContext.onmessage = (event: MessageEvent<WorkerRequest>): void => {
    const { requestId, request } = event.data;

    try {
      const decoded = decodeBatchRequest(request);
      const transferables: Transferable[] = [decoded.payloadBuffer];
      const transferredBuffers = new Set<ArrayBuffer>([decoded.payloadBuffer]);

      decoded.decodedImages.forEach((entry) => {
        if (!transferredBuffers.has(entry.compressedBytes)) {
          transferredBuffers.add(entry.compressedBytes);
          transferables.push(entry.compressedBytes);
        }
      });
      decoded.decodedScenes.forEach((entry) => {
        if (!transferredBuffers.has(entry.positions)) {
          transferredBuffers.add(entry.positions);
          transferables.push(entry.positions);
        }
        if (entry.intensity && !transferredBuffers.has(entry.intensity)) {
          transferredBuffers.add(entry.intensity);
          transferables.push(entry.intensity);
        }
      });

      const response: WorkerSuccessResponse = {
        requestId,
        success: true,
        result: decoded,
      };

      workerContext.postMessage(response, transferables);
    } catch (error) {
      const response: WorkerErrorResponse = {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      workerContext.postMessage(response);
    }
  };
}

export { decodeBatchRequest as decodeMultimodalWindowBatchRequest };
