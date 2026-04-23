import type { Scene3dFrame } from "./archetypes";
import type {
  MultimodalPointCloud2DecodeRequest,
  MultimodalPointCloud2DecodeResponse,
} from "./pointcloud2-decoder";
import { decodePointCloud2Payload } from "./pointcloud2-decoder";
import PointCloud2Worker from "./pointcloud2-worker.ts?worker&inline";

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
        intensity: ArrayBuffer | null;
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
  private worker: Worker | null = null;
  private nextRequestId = 0;
  private pending = new Map<number, PendingDecode>();

  private getWorker() {
    if (!this.worker) {
      this.worker = new PointCloud2Worker();
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
                positions: new Float32Array(response.result.positions),
                intensity: response.result.intensity
                  ? new Float32Array(response.result.intensity)
                  : null,
                colors: null,
                solidColor: null,
                pointSize: null,
              },
            ],
          },
        });
      };

      this.worker.onerror = (event) => {
        const error = new Error(event.message || "PointCloud2 worker failed");
        this.pending.forEach(({ reject }) => reject(error));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }

    return this.worker;
  }

  async decode(
    request: MultimodalPointCloud2DecodeRequest
  ): Promise<MultimodalPointCloud2DecodeResponse> {
    if (typeof Worker === "undefined") {
      const decoded = decodePointCloud2Payload(new Uint8Array(request.payload));
      return {
        messageId: request.messageId,
        frame: {
          ...decoded.frame,
          id: request.messageId,
        },
      };
    }

    const worker = this.getWorker();
    const requestId = this.nextRequestId++;
    const payload = request.payload.slice(0);

    return new Promise<MultimodalPointCloud2DecodeResponse>(
      (resolve, reject) => {
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
      }
    );
  }

  dispose() {
    this.pending.forEach(({ reject }) => {
      reject(new Error("PointCloud2 worker disposed"));
    });
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

const decoderClient = new PointCloud2DecoderClient();

/** Decodes one raw `PointCloud2` payload in a worker when available. */
export function decodePointCloud2InWorker(
  request: MultimodalPointCloud2DecodeRequest
): Promise<MultimodalPointCloud2DecodeResponse> {
  return decoderClient.decode(request);
}

/** Disposes the shared pointcloud worker client and pending requests. */
export function disposePointCloud2WorkerClient() {
  decoderClient.dispose();
}
