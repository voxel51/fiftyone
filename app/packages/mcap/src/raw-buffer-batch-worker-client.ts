import RawBufferBatchWorker from "./raw-buffer-batch-worker.ts?worker&inline";
import { decodeMultimodalWindowBatchRequest } from "./raw-buffer-batch-worker";
import type { DecodeBatchRequest, DecodeBatchResponse } from "./types";

type PendingDecode = {
  resolve: (value: DecodeBatchResponse) => void;
  reject: (reason?: unknown) => void;
};

type WorkerResponse =
  | {
      requestId: number;
      success: true;
      result: DecodeBatchResponse;
    }
  | {
      requestId: number;
      success: false;
      error: string;
    };

class RawBufferBatchDecoderClient {
  private worker: Worker | null = null;
  private nextRequestId = 0;
  private pending = new Map<number, PendingDecode>();

  private getWorker() {
    if (!this.worker) {
      this.worker = new RawBufferBatchWorker();
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

        pending.resolve(response.result);
      };
      this.worker.onerror = (event) => {
        const error = new Error(
          event.message || "Raw-buffer batch worker failed"
        );
        this.pending.forEach(({ reject }) => reject(error));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }

    return this.worker;
  }

  async decode(request: DecodeBatchRequest): Promise<DecodeBatchResponse> {
    if (typeof Worker === "undefined") {
      return decodeMultimodalWindowBatchRequest(request);
    }

    const worker = this.getWorker();
    const requestId = this.nextRequestId++;

    return new Promise<DecodeBatchResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage(
        {
          requestId,
          request,
        },
        [request.payloadBuffer]
      );
    });
  }

  dispose() {
    this.pending.forEach(({ reject }) => {
      reject(new Error("Raw-buffer batch worker disposed"));
    });
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

const decoderClient = new RawBufferBatchDecoderClient();

export function decodeRawBufferBatchInWorker(
  request: DecodeBatchRequest
): Promise<DecodeBatchResponse> {
  return decoderClient.decode(request);
}

export function disposeRawBufferBatchWorkerClient() {
  decoderClient.dispose();
}
