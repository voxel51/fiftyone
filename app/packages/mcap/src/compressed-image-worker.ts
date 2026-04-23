import {
  decodeCompressedImagePayload,
  type MultimodalCompressedImageDecodeRequest,
  type MultimodalCompressedImageDecodeResponse,
} from "./compressed-image-decoder";
import { decodeFoxgloveCompressedImagePayload } from "./foxglove-compressed-image-decoder";

type WorkerRequest = {
  requestId: number;
  request: MultimodalCompressedImageDecodeRequest;
};

type WorkerSuccessResponse = {
  requestId: number;
  success: true;
  result: {
    messageId: string;
    format: string;
    frameId: string;
    compressedBytes: ArrayBuffer;
    compressedBytesByteOffset: number;
    compressedBytesByteLength: number;
  };
};

type WorkerErrorResponse = {
  requestId: number;
  success: false;
  error: string;
};

export function decodeMultimodalCompressedImageRequest(
  request: MultimodalCompressedImageDecodeRequest
): MultimodalCompressedImageDecodeResponse {
  switch (request.schemaName) {
    case "sensor_msgs/msg/CompressedImage":
      return {
        ...decodeCompressedImagePayload(new Uint8Array(request.payload)),
        messageId: request.messageId,
      };
    case "foxglove.CompressedImage":
      return {
        ...decodeFoxgloveCompressedImagePayload(
          new Uint8Array(request.payload)
        ),
        messageId: request.messageId,
      };
    default:
      throw new Error(
        `Unsupported compressed-image schema in worker: ${request.schemaName}`
      );
  }
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
      const decoded = decodeMultimodalCompressedImageRequest(request);
      const compressedBytes =
        decoded.compressedBytes instanceof Uint8Array
          ? decoded.compressedBytes
          : Uint8Array.from(decoded.compressedBytes);
      const response: WorkerSuccessResponse = {
        requestId,
        success: true,
        result: {
          messageId: decoded.messageId,
          format: decoded.format,
          frameId: decoded.frameId,
          compressedBytes: compressedBytes.buffer,
          compressedBytesByteOffset: compressedBytes.byteOffset,
          compressedBytesByteLength: compressedBytes.byteLength,
        },
      };

      workerContext.postMessage(response, [compressedBytes.buffer]);
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
