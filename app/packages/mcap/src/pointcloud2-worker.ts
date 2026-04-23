import {
  decodePointCloud2Payload,
  type MultimodalPointCloud2DecodeRequest,
} from "./pointcloud2-decoder";
import { decodeFoxglovePointCloudPayload } from "./foxglove-pointcloud-decoder";

type WorkerRequest = {
  requestId: number;
  request: MultimodalPointCloud2DecodeRequest;
};

type WorkerSuccessResponse = {
  requestId: number;
  success: true;
  result: {
    messageId: string;
    pointCount: number;
    positions: ArrayBuffer;
    positionsByteOffset: number;
    positionsByteLength: number;
    intensity: ArrayBuffer | null;
    intensityByteOffset: number;
    intensityByteLength: number;
    frameId: string | null;
    bounds: {
      min: [number, number, number];
      max: [number, number, number];
    };
  };
};

type WorkerErrorResponse = {
  requestId: number;
  success: false;
  error: string;
};

export function decodeMultimodalPointCloudRequest(
  request: MultimodalPointCloud2DecodeRequest
) {
  switch (request.schemaName) {
    case "sensor_msgs/msg/PointCloud2":
      return {
        ...decodePointCloud2Payload(new Uint8Array(request.payload)),
        messageId: request.messageId,
      };
    case "foxglove.PointCloud":
      return {
        ...decodeFoxglovePointCloudPayload(new Uint8Array(request.payload)),
        messageId: request.messageId,
      };
    default:
      throw new Error(
        `Unsupported point-cloud schema in worker: ${request.schemaName}`
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
      const decoded = decodeMultimodalPointCloudRequest(request);
      const pointsPrimitive = decoded.frame.primitives[0];
      if (!pointsPrimitive || pointsPrimitive.kind !== "points") {
        throw new Error(
          "Point-cloud decoder did not return a points primitive"
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
      const transferables: Transferable[] = [positions.buffer];

      if (intensity) {
        transferables.push(intensity.buffer);
      }

      const response: WorkerSuccessResponse = {
        requestId,
        success: true,
        result: {
          messageId: decoded.messageId,
          pointCount: decoded.frame.pointCount,
          positions: positions.buffer,
          positionsByteOffset: positions.byteOffset,
          positionsByteLength: positions.byteLength,
          intensity: intensity ? intensity.buffer : null,
          intensityByteOffset: intensity?.byteOffset ?? 0,
          intensityByteLength: intensity?.byteLength ?? 0,
          frameId: pointsPrimitive.frameId ?? decoded.frame.frameId ?? null,
          bounds: decoded.frame.bounds,
        },
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
