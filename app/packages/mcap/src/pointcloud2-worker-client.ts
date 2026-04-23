import type { Scene3dFrame } from "./archetypes";
import type {
  MultimodalPointCloud2DecodeRequest,
  MultimodalPointCloud2DecodeResponse,
} from "./pointcloud2-decoder";
import PointCloud2Worker from "./pointcloud2-worker.ts?worker&inline";
import { decodeMultimodalPointCloudRequest } from "./pointcloud2-worker";

type PendingDecode = {
  resolve: (value: MultimodalPointCloud2DecodeResponse) => void;
  reject: (reason?: unknown) => void;
};

type WorkerResponse =
  | {
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
        bounds: Scene3dFrame["bounds"];
      };
    }
  | {
      requestId: number;
      success: false;
      error: string;
    };

class PointCloud2DecoderClient {
  private workers: Array<{
    worker: Worker;
    pending: Map<number, PendingDecode>;
  } | null> = [];
  private nextRequestId = 0;
  private nextWorkerIndex = 0;

  private getWorkerEntries() {
    for (let workerIndex = 0; workerIndex < 2; workerIndex += 1) {
      if (this.workers[workerIndex]) {
        continue;
      }

      const worker = new PointCloud2Worker();
      const pending = new Map<number, PendingDecode>();
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const workerEntry = this.workers[workerIndex];
        const nextPending = workerEntry?.pending.get(response.requestId);

        if (!nextPending) {
          return;
        }

        workerEntry.pending.delete(response.requestId);

        if (!response.success) {
          nextPending.reject(new Error(response.error));
          return;
        }

        nextPending.resolve({
          messageId: response.result.messageId,
          frame: {
            id: response.result.messageId,
            pointCount: response.result.pointCount,
            bounds: response.result.bounds,
            frameId: response.result.frameId,
            primitives: [
              {
                kind: "points",
                id: "points",
                frameId: response.result.frameId,
                pointCount: response.result.pointCount,
                positions: new Float32Array(
                  response.result.positions,
                  response.result.positionsByteOffset,
                  response.result.positionsByteLength /
                    Float32Array.BYTES_PER_ELEMENT
                ),
                intensity: response.result.intensity
                  ? new Float32Array(
                      response.result.intensity,
                      response.result.intensityByteOffset,
                      response.result.intensityByteLength /
                        Float32Array.BYTES_PER_ELEMENT
                    )
                  : null,
                colors: null,
                solidColor: null,
                pointSize: null,
              },
            ],
          },
        });
      };

      worker.onerror = (event) => {
        const error = new Error(event.message || "PointCloud2 worker failed");
        const workerEntry = this.workers[workerIndex];
        workerEntry?.pending.forEach(({ reject }) => reject(error));
        workerEntry?.pending.clear();
        worker.terminate();
        this.workers[workerIndex] = null;
      };

      this.workers[workerIndex] = {
        worker,
        pending,
      };
    }

    return this.workers.filter(
      (
        workerEntry
      ): workerEntry is {
        worker: Worker;
        pending: Map<number, PendingDecode>;
      } => workerEntry !== null
    );
  }

  async decode(
    request: MultimodalPointCloud2DecodeRequest
  ): Promise<MultimodalPointCloud2DecodeResponse> {
    if (typeof Worker === "undefined") {
      return decodeMultimodalPointCloudRequest(request);
    }

    const workerEntries = this.getWorkerEntries();
    const workerEntry =
      workerEntries[this.nextWorkerIndex++ % workerEntries.length];
    const requestId = this.nextRequestId++;

    return new Promise<MultimodalPointCloud2DecodeResponse>(
      (resolve, reject) => {
        workerEntry.pending.set(requestId, { resolve, reject });
        workerEntry.worker.postMessage(
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
    this.workers.forEach((workerEntry) => {
      if (!workerEntry) {
        return;
      }

      const { pending, worker } = workerEntry;
      pending.forEach(({ reject }) => {
        reject(new Error("PointCloud2 worker disposed"));
      });
      pending.clear();
      worker.terminate();
    });
    this.workers = [];
    this.nextWorkerIndex = 0;
  }
}

const decoderClient = new PointCloud2DecoderClient();

/** Decodes one raw supported point-cloud payload in a worker when available. */
export function decodePointCloud2InWorker(
  request: MultimodalPointCloud2DecodeRequest
): Promise<MultimodalPointCloud2DecodeResponse> {
  return decoderClient.decode(request);
}

/** Disposes the shared pointcloud worker client and pending requests. */
export function disposePointCloud2WorkerClient() {
  decoderClient.dispose();
}
