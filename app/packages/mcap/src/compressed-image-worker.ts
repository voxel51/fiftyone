import {
  decodeCompressedImagePayload,
  type McapCompressedImageDecodeRequest,
} from "./compressed-image-decoder";

type WorkerRequest = {
  requestId: number;
  request: McapCompressedImageDecodeRequest;
};

type WorkerSuccessResponse = {
  requestId: number;
  success: true;
  result: {
    messageId: string;
    format: string;
    compressedBytes: ArrayBuffer;
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
    const decoded = decodeCompressedImagePayload(
      new Uint8Array(request.payload)
    );
    const compressedBytes = Uint8Array.from(decoded.compressedBytes);
    const response: WorkerSuccessResponse = {
      requestId,
      success: true,
      result: {
        messageId: request.messageId,
        format: decoded.format,
        compressedBytes: compressedBytes.buffer,
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
