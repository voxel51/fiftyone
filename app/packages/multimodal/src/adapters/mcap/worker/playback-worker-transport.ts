import { mcapPlaybackWorkerOperation } from "./playback-worker-rpc";
import { toError } from "../../../utils/errors";
import { EpisodeReadCancelledError } from "../../../ports";
import type {
  McapPlaybackWorkerPriority,
  McapPlaybackWorkerRequest,
  McapPlaybackWorkerRequestPayloadByType,
  McapPlaybackWorkerResponse,
  McapPlaybackWorkerResultByType,
  McapPlaybackWorkerRpcRequest,
  McapPlaybackWorkerStreamItemByType,
  McapPlaybackWorkerStreamType,
  McapPlaybackWorkerTransportResponse,
  McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import type { McapTransportSnapshot } from "./transport-meter";
import {
  emptyMcapBoundedReadUsage,
  McapBoundedReadCancelledError,
} from "../reader/bounded-read-cancellation";
type PendingRequest<
  Type extends McapPlaybackWorkerUnaryType = McapPlaybackWorkerUnaryType,
> = {
  cancelled?: boolean;
  readonly cleanup?: () => void;
  readonly onProgress?: (
    result: McapPlaybackWorkerResultByType["readSynchronizedMessages"],
  ) => void;
  readonly reject: (error: Error) => void;
  readonly resolve: (result: McapPlaybackWorkerResultByType[Type]) => void;
  readonly sourceKey: string;
  readonly supersessionKeys: readonly string[];
  readonly type: McapPlaybackWorkerUnaryType;
};

type PendingStream = {
  readonly cleanup?: () => void;
  readonly rejectors: Array<(error: Error) => void>;
  readonly resolvers: Array<(result: IteratorResult<unknown, void>) => void>;
  readonly sourceKey: string;
  readonly values: unknown[];
  done: boolean;
  error?: Error;
};

/**
 * Typed request/response transport for the MCAP playback worker protocol.
 */
export class McapPlaybackWorkerTransport {
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private streams = new Map<number, PendingStream>();

  constructor(
    private readonly isActiveSource: (sourceKey: string) => boolean,
    private readonly onTransport?: (snapshot: McapTransportSnapshot) => void,
  ) {}

  /**
   * Sends one unary worker RPC and resolves with the final response payload.
   */
  request<Type extends McapPlaybackWorkerUnaryType>(
    worker: Worker,
    sourceKey: string,
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
    supersessionKeys: readonly string[] = [],
    signal?: AbortSignal,
    retainedDecodedRecordIds?: readonly string[],
    onProgress?: (
      result: McapPlaybackWorkerResultByType["readSynchronizedMessages"],
    ) => void,
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    const id = this.nextRequestId++;
    const message = createRpcRequest(
      id,
      sourceKey,
      type,
      payload,
      priority,
      retainedDecodedRecordIds,
    );

    return new Promise((resolve, reject) => {
      const cancel = () => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        if (pending.type === "readBoundedMessages") {
          // Keep bounded reads pending until the worker reports its
          // best-effort partial usage at the next cancellation boundary.
          pending.cancelled = true;
        } else {
          this.pending.delete(id);
          pending.cleanup?.();
          pending.reject(new EpisodeReadCancelledError());
        }
        try {
          worker.postMessage({ id, type: "cancel" });
        } catch {
          if (pending.type === "readBoundedMessages") {
            this.pending.delete(id);
            pending.cleanup?.();
            pending.reject(new EpisodeReadCancelledError());
          }
        }
      };
      if (signal?.aborted) {
        reject(new EpisodeReadCancelledError());
        return;
      }
      signal?.addEventListener("abort", cancel, { once: true });
      this.pending.set(id, {
        ...(signal
          ? {
              cleanup: () => signal.removeEventListener("abort", cancel),
            }
          : {}),
        ...(onProgress ? { onProgress } : {}),
        reject,
        resolve: resolve as PendingRequest["resolve"],
        sourceKey,
        supersessionKeys,
        type,
      });

      try {
        worker.postMessage(message);
      } catch (error) {
        const pending = this.pending.get(id);
        this.pending.delete(id);
        pending?.cleanup?.();
        reject(toError(error));
      }
    });
  }

  /**
   * Cancels matching pending unary requests and returns their ids so the caller
   * can tell the worker to drop or abort them. Ordinary reads reject locally.
   * Bounded reads wait for the worker's partial-usage acknowledgement.
   */
  cancelPending(
    filter: (pending: {
      readonly supersessionKeys: readonly string[];
      readonly type: McapPlaybackWorkerUnaryType;
    }) => boolean,
  ): number[] {
    const cancelledIds: number[] = [];
    for (const [id, pending] of this.pending) {
      if (
        !filter({
          supersessionKeys: pending.supersessionKeys,
          type: pending.type,
        })
      ) {
        continue;
      }
      if (pending.type === "readBoundedMessages") {
        pending.cancelled = true;
      } else {
        this.pending.delete(id);
        pending.cleanup?.();
        pending.reject(new EpisodeReadCancelledError());
      }
      cancelledIds.push(id);
    }

    return cancelledIds;
  }

  /**
   * Cancels every pending stream: rejects each locally with the canonical
   * cancelled error and returns their ids so the caller can tell the worker
   * to drop or abort the matching jobs. Queued jobs the worker drops send
   * no response, so local settlement is what keeps consumers from hanging.
   */
  cancelStreams(): number[] {
    const cancelledIds: number[] = [];
    for (const [id, stream] of [...this.streams]) {
      this.failStream(id, stream, new EpisodeReadCancelledError());
      cancelledIds.push(id);
    }

    return cancelledIds;
  }

  /**
   * Sends one streaming worker RPC and yields incremental response payloads.
   */
  async *stream<Type extends McapPlaybackWorkerStreamType>(
    worker: Worker,
    sourceKey: string,
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type],
    priority?: McapPlaybackWorkerPriority,
    signal?: AbortSignal,
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    const id = this.nextRequestId++;
    const message = createRpcRequest(id, sourceKey, type, payload, priority);
    const cancel = () => {
      const pending = this.streams.get(id);
      if (!pending) return;
      this.failStream(id, pending, new EpisodeReadCancelledError());
      try {
        worker.postMessage({ id, type: "cancel" });
      } catch {
        // Local rejection already settled the consumer.
      }
    };
    if (signal?.aborted) {
      throw new EpisodeReadCancelledError();
    }
    const stream: PendingStream = {
      ...(signal
        ? { cleanup: () => signal.removeEventListener("abort", cancel) }
        : {}),
      done: false,
      rejectors: [],
      resolvers: [],
      sourceKey,
      values: [],
    };

    signal?.addEventListener("abort", cancel, { once: true });
    this.streams.set(id, stream);
    try {
      worker.postMessage(message);
    } catch (error) {
      this.streams.delete(id);
      stream.cleanup?.();
      throw toError(error);
    }

    try {
      while (true) {
        if (signal?.aborted) throw new EpisodeReadCancelledError();
        const next = await nextStreamValue(stream);
        if (signal?.aborted) throw new EpisodeReadCancelledError();
        if (next.done) {
          return;
        }

        yield next.value as McapPlaybackWorkerStreamItemByType[Type];
      }
    } finally {
      this.cancelStream(worker, id, sourceKey);
    }
  }

  /**
   * Applies one worker response to the matching pending request or stream.
   */
  handleResponse(response: McapPlaybackWorkerResponse) {
    if (isTransportResponse(response)) {
      this.onTransport?.(response.transport);
      return;
    }

    if ("transport" in response && response.transport) {
      this.onTransport?.(response.transport);
    }

    const pending = this.pending.get(response.id);
    if (pending && response.ok && "progress" in response) {
      pending.onProgress?.(response.result);
      return;
    }

    if (response.ok && "stream" in response) {
      this.handleStreamResponse(response);
      return;
    }

    if (pending) {
      // A response can arrive after the client has moved to another source.
      // It still owns this request id, so settle and remove it instead of
      // leaving the caller's promise hanging.
      this.pending.delete(response.id);
      pending.cleanup?.();
      if (
        pending.type === "readBoundedMessages" &&
        (pending.cancelled ||
          (!response.ok && response.boundedReadCancellation !== undefined))
      ) {
        const usage = response.ok
          ? "usage" in response.result
            ? response.result.usage
            : emptyMcapBoundedReadUsage()
          : (response.boundedReadCancellation?.usage ??
            emptyMcapBoundedReadUsage());
        pending.reject(new McapBoundedReadCancelledError(usage));
        return;
      }
      if (response.ok) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error));
      }
      return;
    }

    if (!response.ok) {
      const stream = this.streams.get(response.id);
      if (stream) {
        this.failStream(response.id, stream, new Error(response.error));
      }
    }
  }

  /**
   * True when no unary request or stream is in flight. Lanes that exist for
   * one-shot work (bulk history) use this to release their worker once the
   * queue drains.
   */
  isIdle(): boolean {
    return this.pending.size === 0 && this.streams.size === 0;
  }

  /**
   * Rejects all pending work, keeping buffered stream values available first.
   */
  rejectAll(reason: string) {
    const error = new Error(reason);
    for (const pending of this.pending.values()) {
      pending.cleanup?.();
      pending.reject(error);
    }
    this.pending.clear();
    for (const stream of this.streams.values()) {
      stream.cleanup?.();
      stream.error = error;
      stream.done = true;
      rejectStream(stream, error);
    }
    this.streams.clear();
  }

  private handleStreamResponse(
    response: Extract<McapPlaybackWorkerResponse, { readonly stream: true }>,
  ) {
    const stream = this.streams.get(response.id);
    if (!stream) {
      return;
    }
    if (!this.isActiveSource(stream.sourceKey)) {
      // Stale stream success has no active consumer anymore. Finish it so any
      // awaiting iterator observes completion and the stream entry is released.
      this.finishStream(response.id, stream);
      return;
    }

    if (response.done) {
      this.finishStream(response.id, stream);
    } else {
      const items = "items" in response ? response.items : [response.item];
      for (const item of items) {
        pushStreamValue(stream, item);
      }
    }
  }

  private cancelStream(worker: Worker, id: number, sourceKey: string) {
    const stream = this.streams.get(id);
    if (!stream || !this.streams.delete(id)) {
      return;
    }
    stream.cleanup?.();
    if (!this.isActiveSource(sourceKey)) return;

    worker.postMessage({ id, type: "cancel" });
  }

  private finishStream(id: number, stream: PendingStream) {
    stream.done = true;
    this.streams.delete(id);
    stream.cleanup?.();
    resolveStreamDone(stream);
  }

  private failStream(id: number, stream: PendingStream, error: Error) {
    stream.error = error;
    this.streams.delete(id);
    stream.cleanup?.();
    rejectStream(stream, error);
  }
}

function isTransportResponse(
  response: McapPlaybackWorkerResponse,
): response is McapPlaybackWorkerTransportResponse {
  return "type" in response && response.type === "transport";
}

function createRpcRequest<Type extends McapPlaybackWorkerUnaryType>(
  id: number,
  sourceKey: string,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type],
  priority?: McapPlaybackWorkerPriority,
  retainedDecodedRecordIds?: readonly string[],
): McapPlaybackWorkerRpcRequest<Type>;
function createRpcRequest<Type extends McapPlaybackWorkerStreamType>(
  id: number,
  sourceKey: string,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type],
  priority?: McapPlaybackWorkerPriority,
  retainedDecodedRecordIds?: readonly string[],
): McapPlaybackWorkerRpcRequest<Type>;
function createRpcRequest(
  id: number,
  sourceKey: string,
  type: McapPlaybackWorkerRpcRequest["type"],
  payload: McapPlaybackWorkerRpcRequest["payload"],
  priority?: McapPlaybackWorkerPriority,
  retainedDecodedRecordIds?: readonly string[],
): McapPlaybackWorkerRequest {
  return {
    id,
    payload,
    priority: priority ?? mcapPlaybackWorkerOperation(type).priority,
    ...(retainedDecodedRecordIds && retainedDecodedRecordIds.length > 0
      ? { retainedDecodedRecordIds }
      : {}),
    sourceKey,
    type,
  } as McapPlaybackWorkerRequest;
}

function nextStreamValue(
  stream: PendingStream,
): Promise<IteratorResult<unknown, void>> {
  const value = stream.values.shift();
  if (value !== undefined) {
    return Promise.resolve({ done: false, value });
  }

  if (stream.error) {
    return Promise.reject(stream.error);
  }

  if (stream.done) {
    return Promise.resolve({ done: true, value: undefined });
  }

  return new Promise((resolve, reject) => {
    stream.resolvers.push(resolve);
    stream.rejectors.push(reject);
  });
}

function pushStreamValue(stream: PendingStream, value: unknown) {
  const resolve = stream.resolvers.shift();
  if (resolve) {
    stream.rejectors.shift();
    resolve({ done: false, value });
  } else {
    stream.values.push(value);
  }
}

function resolveStreamDone(stream: PendingStream) {
  for (const resolve of stream.resolvers.splice(0)) {
    resolve({ done: true, value: undefined });
  }
  stream.rejectors.length = 0;
}

function rejectStream(stream: PendingStream, error: Error) {
  for (const reject of stream.rejectors.splice(0)) {
    reject(error);
  }
  stream.resolvers.length = 0;
}
