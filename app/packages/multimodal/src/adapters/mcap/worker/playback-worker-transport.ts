import { mcapPlaybackWorkerOperation } from "./playback-worker-rpc";
import { mcapError, mcapReadCancelledError } from "../errors";
import type { McapPlaybackWorkerAttribution } from "./playback-worker-attribution";
import type {
  McapPlaybackWorkerPriority,
  McapPlaybackWorkerRequest,
  McapPlaybackWorkerRequestPayloadByType,
  McapPlaybackWorkerResponse,
  McapPlaybackWorkerResultByType,
  McapPlaybackWorkerRpcRequest,
  McapPlaybackWorkerStreamItemByType,
  McapPlaybackWorkerStreamType,
  McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import type { McapTransportSnapshot } from "./transport-meter";

type PendingRequest<
  Type extends McapPlaybackWorkerUnaryType = McapPlaybackWorkerUnaryType,
> = {
  readonly reject: (error: Error) => void;
  readonly resolve: (result: McapPlaybackWorkerResultByType[Type]) => void;
  readonly sourceKey: string;
  readonly type: McapPlaybackWorkerUnaryType;
};

type PendingStream = {
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
    private readonly onAttribution?: (
      attribution: McapPlaybackWorkerAttribution,
    ) => void,
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
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    const id = this.nextRequestId++;
    const message = createRpcRequest(id, sourceKey, type, payload, priority);

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: resolve as PendingRequest["resolve"],
        sourceKey,
        type,
      });

      try {
        worker.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        reject(mcapError(error));
      }
    });
  }

  /**
   * Cancels matching pending unary requests: rejects each locally with the
   * canonical cancelled error and returns their ids so the caller can tell
   * the worker to drop or abort the matching jobs. Late worker responses
   * for these ids are ignored by handleResponse.
   */
  cancelPending(
    filter: (pending: {
      readonly type: McapPlaybackWorkerUnaryType;
    }) => boolean,
  ): number[] {
    const cancelledIds: number[] = [];
    for (const [id, pending] of this.pending) {
      if (!filter({ type: pending.type })) {
        continue;
      }
      this.pending.delete(id);
      pending.reject(mcapReadCancelledError());
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
      this.failStream(id, stream, mcapReadCancelledError());
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
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    const id = this.nextRequestId++;
    const message = createRpcRequest(id, sourceKey, type, payload, priority);
    const stream: PendingStream = {
      done: false,
      rejectors: [],
      resolvers: [],
      sourceKey,
      values: [],
    };

    this.streams.set(id, stream);
    try {
      worker.postMessage(message);
    } catch (error) {
      this.streams.delete(id);
      throw mcapError(error);
    }

    try {
      while (true) {
        const next = await nextStreamValue(stream);
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
    if (response.debugAttribution) {
      this.onAttribution?.(response.debugAttribution);
    }
    if ("transport" in response && response.transport) {
      this.onTransport?.(response.transport);
    }

    if (response.ok && "stream" in response) {
      this.handleStreamResponse(response);
      return;
    }

    const pending = this.pending.get(response.id);
    if (pending) {
      // A response can arrive after the client has moved to another source.
      // It still owns this request id, so settle and remove it instead of
      // leaving the caller's promise hanging.
      this.pending.delete(response.id);
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
      pending.reject(error);
    }
    this.pending.clear();
    for (const stream of this.streams.values()) {
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
      pushStreamValue(stream, response.item);
    }
  }

  private cancelStream(worker: Worker, id: number, sourceKey: string) {
    if (!this.streams.delete(id) || !this.isActiveSource(sourceKey)) {
      return;
    }

    worker.postMessage({ id, type: "cancel" });
  }

  private finishStream(id: number, stream: PendingStream) {
    stream.done = true;
    this.streams.delete(id);
    resolveStreamDone(stream);
  }

  private failStream(id: number, stream: PendingStream, error: Error) {
    stream.error = error;
    this.streams.delete(id);
    rejectStream(stream, error);
  }
}

function createRpcRequest<Type extends McapPlaybackWorkerUnaryType>(
  id: number,
  sourceKey: string,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type],
  priority?: McapPlaybackWorkerPriority,
): McapPlaybackWorkerRpcRequest<Type>;
function createRpcRequest<Type extends McapPlaybackWorkerStreamType>(
  id: number,
  sourceKey: string,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type],
  priority?: McapPlaybackWorkerPriority,
): McapPlaybackWorkerRpcRequest<Type>;
function createRpcRequest(
  id: number,
  sourceKey: string,
  type: McapPlaybackWorkerRpcRequest["type"],
  payload: McapPlaybackWorkerRpcRequest["payload"],
  priority?: McapPlaybackWorkerPriority,
): McapPlaybackWorkerRequest {
  return {
    id,
    payload,
    priority: priority ?? mcapPlaybackWorkerOperation(type).priority,
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
