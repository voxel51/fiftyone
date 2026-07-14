import { byteSourceAccessKey } from "../../../query/bytes";
import { mcapError } from "../errors";
import type {
  McapGridPreviewRequestPayload,
  McapGridPreviewResult,
  McapGridPreviewWorkerResponse,
  McapGridPreviewWorkerRpcRequest,
} from "./grid-preview-worker-types";

const CANCELLED_ERROR_MESSAGE = "MCAP grid preview request cancelled";

type PendingRequest = {
  readonly reject: (error: Error) => void;
  readonly resolve: (result: McapGridPreviewResult) => void;
  readonly worker: Worker;
};

/**
 * Error used when a grid preview request is cancelled before completion.
 */
export class McapGridPreviewRequestCancelledError extends Error {
  constructor() {
    super(CANCELLED_ERROR_MESSAGE);
    this.name = "McapGridPreviewRequestCancelledError";
  }
}

/**
 * Flat unary request/response transport for the MCAP grid preview worker.
 */
export class McapGridPreviewTransport {
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();

  request(
    worker: Worker,
    payload: McapGridPreviewRequestPayload,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<McapGridPreviewResult> {
    if (options.signal?.aborted) {
      return Promise.reject(new McapGridPreviewRequestCancelledError());
    }

    const id = this.nextRequestId++;
    const message: McapGridPreviewWorkerRpcRequest = {
      id,
      payload,
      sourceKey: byteSourceAccessKey(payload.source),
      type: "decodeGridPreview",
    };

    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!this.pending.delete(id)) {
          return;
        }

        try {
          worker.postMessage({ id, type: "cancel" });
        } catch {
          // The worker may already be gone; the local promise is already done.
        }
        reject(new McapGridPreviewRequestCancelledError());
      };

      options.signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        reject: (error) => {
          options.signal?.removeEventListener("abort", abort);
          reject(error);
        },
        resolve: (result) => {
          options.signal?.removeEventListener("abort", abort);
          resolve(result);
        },
        worker,
      });

      try {
        worker.postMessage(message);
      } catch (error) {
        options.signal?.removeEventListener("abort", abort);
        this.pending.delete(id);
        reject(mcapError(error));
      }
    });
  }

  handleResponse(response: McapGridPreviewWorkerResponse) {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  rejectAll(reason: string) {
    const error = new Error(reason);
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/**
 * Returns whether an error came from grid preview request cancellation.
 */
export function isMcapGridPreviewRequestCancelled(error: unknown): boolean {
  return error instanceof McapGridPreviewRequestCancelledError;
}
