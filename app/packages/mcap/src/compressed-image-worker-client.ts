import type {
  MultimodalCompressedImageDecodeRequest,
  MultimodalCompressedImageDecodeResponse,
} from "./compressed-image-decoder";
import CompressedImageWorker from "./compressed-image-worker.ts?worker&inline";
import { decodeMultimodalCompressedImageRequest } from "./compressed-image-worker";

type PendingDecode = {
  resolve: (value: MultimodalCompressedImageDecodeResponse) => void;
  reject: (reason?: unknown) => void;
};

type WorkerResponse =
  | {
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
    }
  | {
      requestId: number;
      success: false;
      error: string;
    };

class CompressedImageDecoderClient {
  private worker: Worker | null = null;
  private nextRequestId = 0;
  private pending = new Map<number, PendingDecode>();

  private getWorker() {
    if (!this.worker) {
      this.worker = new CompressedImageWorker();
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const pending = this.pending.get(response.requestId);

        if (!pending) {
          return;
        }

        this.pending.delete(response.requestId);

        if (!response.success) {
          pending.reject(new Error(response.error));
          return;
        }

        pending.resolve({
          messageId: response.result.messageId,
          format: response.result.format,
          frameId: response.result.frameId,
          compressedBytes: new Uint8Array(
            response.result.compressedBytes,
            response.result.compressedBytesByteOffset,
            response.result.compressedBytesByteLength
          ),
        });
      };

      this.worker.onerror = (event) => {
        const error = new Error(
          event.message || "Compressed image worker failed"
        );
        this.pending.forEach(({ reject }) => reject(error));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }

    return this.worker;
  }

  async decode(
    request: MultimodalCompressedImageDecodeRequest
  ): Promise<MultimodalCompressedImageDecodeResponse> {
    if (typeof Worker === "undefined") {
      return decodeMultimodalCompressedImageRequest(request);
    }

    const worker = this.getWorker();
    const requestId = this.nextRequestId++;

    return new Promise<MultimodalCompressedImageDecodeResponse>(
      (resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        worker.postMessage(
          {
            requestId,
            request: {
              messageId: request.messageId,
              schemaName: request.schemaName,
              payload: request.payload,
            },
          },
          [request.payload]
        );
      }
    );
  }

  dispose() {
    this.pending.forEach(({ reject }) => {
      reject(new Error("Compressed image worker disposed"));
    });
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

const decoderClient = new CompressedImageDecoderClient();

/** Decodes one raw supported compressed-image payload in a worker when available. */
export function decodeCompressedImageInWorker(
  request: MultimodalCompressedImageDecodeRequest
): Promise<MultimodalCompressedImageDecodeResponse> {
  return decoderClient.decode(request);
}

/** Disposes the shared compressed-image worker client and pending requests. */
export function disposeCompressedImageWorkerClient() {
  decoderClient.dispose();
}
