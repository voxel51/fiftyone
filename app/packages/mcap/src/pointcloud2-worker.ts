import {
  decodePointCloud2Payload,
  type MultimodalPointCloud2DecodeRequest,
} from "./pointcloud2-decoder";

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
    intensity: ArrayBuffer | null;
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

const workerContext: DedicatedWorkerGlobalScope =
  self as DedicatedWorkerGlobalScope;

workerContext.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const { requestId, request } = event.data;

  try {
    const decoded = decodePointCloud2Payload(new Uint8Array(request.payload));
    const pointsPrimitive = decoded.frame.primitives[0];
    if (!pointsPrimitive || pointsPrimitive.kind !== "points") {
      throw new Error("PointCloud2 decoder did not return a points primitive");
    }

    const positions = Float32Array.from(pointsPrimitive.positions);
    const intensity = pointsPrimitive.intensity
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
        messageId: request.messageId,
        pointCount: decoded.frame.pointCount,
        positions: positions.buffer,
        intensity: intensity ? intensity.buffer : null,
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
