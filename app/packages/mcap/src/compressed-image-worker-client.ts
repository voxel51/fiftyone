import type {
  McapCompressedImageDecodeRequest,
  McapCompressedImageDecodeResponse,
} from "./compressed-image-decoder";
import { decodeCompressedImagePayload } from "./compressed-image-decoder";
import CompressedImageWorker from "./compressed-image-worker.ts?worker&inline";

type PendingDecode = {
  resolve: (value: McapCompressedImageDecodeResponse) => void;
  reject: (reason?: unknown) => void;
};

type WorkerResponse =
  | {
      requestId: number;
      success: true;
      result: {
        messageId: string;
        format: string;
        compressedBytes: ArrayBuffer;
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
          compressedBytes: new Uint8Array(response.result.compressedBytes),
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
    request: McapCompressedImageDecodeRequest
  ): Promise<McapCompressedImageDecodeResponse> {
    if (typeof Worker === "undefined") {
      const decoded = decodeCompressedImagePayload(
        new Uint8Array(request.payload)
      );
      return {
        messageId: request.messageId,
        format: decoded.format,
        compressedBytes: decoded.compressedBytes,
      };
    }

    const worker = this.getWorker();
    const requestId = this.nextRequestId++;
    const payload = request.payload.slice(0);

    return new Promise<McapCompressedImageDecodeResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage(
        {
          requestId,
          request: {
            messageId: request.messageId,
            payload,
          },
        },
        [payload]
      );
    });
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

/** Decodes one raw `CompressedImage` payload in a worker when available. */
export function decodeCompressedImageInWorker(
  request: McapCompressedImageDecodeRequest
): Promise<McapCompressedImageDecodeResponse> {
  return decoderClient.decode(request);
}

/** Disposes the shared compressed-image worker client and pending requests. */
export function disposeCompressedImageWorkerClient() {
  decoderClient.dispose();
}
