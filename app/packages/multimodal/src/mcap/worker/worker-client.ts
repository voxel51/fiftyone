import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { createMcapResourceClient } from "../resources";
import {
  MCAP_PLAYBACK_WORKER_PRIORITY,
  type McapPlaybackWorkerFetchParameters,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerResponse,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerRpcType,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import type {
  McapDecodedMessage,
  McapMessageTime,
  McapReadDecodedMessagesRequest,
  McapReadMessageTimesRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTimelineAnchorsRequest,
  McapResourceClient,
  McapSourceDescriptor,
  McapSynchronizedMessageWindow,
} from "../types";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export interface CreateWorkerMcapResourceClientOptions {
  readonly fallback?: "error" | "inline";
  readonly workerFactory?: () => Worker;
}

type PendingRequest<
  Type extends McapPlaybackWorkerUnaryType = McapPlaybackWorkerUnaryType
> = {
  readonly reject: (error: Error) => void;
  readonly resolve: (result: McapPlaybackWorkerResultByType[Type]) => void;
  readonly sourceKey: string;
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
 * Creates a worker-backed MCAP resource client for synchronized playback.
 */
export function createWorkerMcapResourceClient(
  options: CreateWorkerMcapResourceClientOptions = {}
): McapResourceClient {
  const fallback = options.fallback ?? "inline";
  if (!options.workerFactory && typeof Worker === "undefined") {
    if (fallback === "inline") {
      return createMcapResourceClient();
    }

    throw new Error("MCAP playback workers are not available");
  }

  try {
    return new WorkerMcapResourceClient(options);
  } catch (error) {
    if (fallback === "inline") {
      return createMcapResourceClient();
    }

    throw error;
  }
}

class WorkerMcapResourceClient implements McapResourceClient {
  private activeSourceKey = "";
  private disposed = false;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private streams = new Map<number, PendingStream>();
  private worker: Worker | undefined;

  constructor(
    private readonly options: CreateWorkerMcapResourceClientOptions
  ) {}

  dispose() {
    this.disposed = true;
    this.resetWorker("MCAP worker disposed");
  }

  async *readDecodedMessages(
    request: McapReadDecodedMessagesRequest
  ): AsyncGenerator<McapDecodedMessage, void, void> {
    for await (const message of this.streamRequest(
      "readDecodedMessages",
      request
    )) {
      yield message;
    }
  }

  async *readMessageTimes(
    request: McapReadMessageTimesRequest
  ): AsyncGenerator<McapMessageTime, void, void> {
    for await (const message of this.streamRequest(
      "readMessageTimes",
      request
    )) {
      yield message;
    }
  }

  readTimelineAnchors(
    request: McapReadTimelineAnchorsRequest
  ): Promise<readonly bigint[]> {
    return this.request("readTimelineAnchors", request);
  }

  readSynchronizedMessages(
    request: McapReadSynchronizedMessagesRequest
  ): Promise<McapSynchronizedMessageWindow> {
    return this.request("readSynchronizedMessages", request);
  }

  readSynchronizedMessageBatch(
    request: McapReadSynchronizedMessageBatchRequest
  ): Promise<readonly McapSynchronizedMessageWindow[]> {
    return this.request("readSynchronizedMessageBatch", request);
  }

  private request<Type extends McapPlaybackWorkerUnaryType>(
    type: Type,
    payload: ParametersForWorkerType<Type>
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    if (this.disposed) {
      return Promise.reject(new Error("MCAP worker client is disposed"));
    }

    const sourceKey = mcapWorkerSourceKey(payload.source);
    const worker = this.workerForSource(sourceKey);
    const id = this.nextRequestId++;
    const message: McapPlaybackWorkerRequest = {
      id,
      payload,
      priority: priorityForRequestType(type),
      sourceKey,
      type,
    } as McapPlaybackWorkerRequest;

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: resolve as PendingRequest["resolve"],
        sourceKey,
      });

      try {
        worker.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async *streamRequest<Type extends McapPlaybackWorkerStreamType>(
    type: Type,
    payload: ParametersForWorkerType<Type>
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }

    const sourceKey = mcapWorkerSourceKey(payload.source);
    const worker = this.workerForSource(sourceKey);
    const id = this.nextRequestId++;
    const stream: PendingStream = {
      done: false,
      rejectors: [],
      resolvers: [],
      sourceKey,
      values: [],
    };
    const message: McapPlaybackWorkerRequest = {
      id,
      payload,
      priority: priorityForRequestType(type),
      sourceKey,
      type,
    } as McapPlaybackWorkerRequest;

    this.streams.set(id, stream);
    try {
      worker.postMessage(message);
    } catch (error) {
      this.streams.delete(id);
      throw error instanceof Error ? error : new Error(String(error));
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
      this.cancelStream(id, sourceKey);
    }
  }

  private workerForSource(sourceKey: string): Worker {
    if (this.worker && this.activeSourceKey === sourceKey) {
      return this.worker;
    }

    this.resetWorker("MCAP worker reset for a different source");
    this.activeSourceKey = sourceKey;
    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<McapPlaybackWorkerResponse>) =>
      this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      this.resetWorker(event.message || "MCAP worker error");
    };
    const initRequest: McapPlaybackWorkerRequest = {
      payload: workerFetchParameters(),
      type: "init",
    };
    this.worker.postMessage(initRequest);

    return this.worker;
  }

  private createWorker(): Worker {
    if (this.options.workerFactory) {
      return this.options.workerFactory();
    }

    return new Worker(new URL("./playback-worker.ts", import.meta.url), {
      type: "module",
    });
  }

  private handleMessage(response: McapPlaybackWorkerResponse) {
    if (response.ok && "stream" in response) {
      this.handleStreamMessage(response);
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending || pending.sourceKey !== this.activeSourceKey) {
      if (!response.ok) {
        const stream = this.streams.get(response.id);
        if (stream && stream.sourceKey === this.activeSourceKey) {
          this.failStream(response.id, stream, new Error(response.error));
        }
      }
      return;
    }

    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  private handleStreamMessage(
    response: Extract<McapPlaybackWorkerResponse, { readonly stream: true }>
  ) {
    const stream = this.streams.get(response.id);
    if (!stream || stream.sourceKey !== this.activeSourceKey) {
      return;
    }

    if (response.done) {
      this.finishStream(response.id, stream);
    } else {
      pushStreamValue(stream, response.item);
    }
  }

  private resetWorker(reason: string) {
    const worker = this.worker;
    this.worker = undefined;

    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        const disposeRequest: McapPlaybackWorkerRequest = {
          type: "dispose",
        };
        worker.postMessage(disposeRequest);
      } catch {
        // The worker may already be gone.
      }
      worker.terminate();
    }

    const error = new Error(reason);
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    for (const stream of this.streams.values()) {
      rejectStream(stream, error);
    }
    this.streams.clear();
  }

  private cancelStream(id: number, sourceKey: string) {
    if (!this.streams.delete(id)) {
      return;
    }

    if (this.worker && this.activeSourceKey === sourceKey) {
      this.worker.postMessage({ id, type: "cancel" });
    }
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

type ParametersForWorkerType<Type extends McapPlaybackWorkerRpcType> =
  Type extends "readDecodedMessages"
    ? McapReadDecodedMessagesRequest
    : Type extends "readMessageTimes"
    ? McapReadMessageTimesRequest
    : Type extends "readSynchronizedMessageBatch"
    ? McapReadSynchronizedMessageBatchRequest
    : Type extends "readSynchronizedMessages"
    ? McapReadSynchronizedMessagesRequest
    : McapReadTimelineAnchorsRequest;

function priorityForRequestType(type: McapPlaybackWorkerRpcType) {
  return type === "readSynchronizedMessageBatch"
    ? MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH
    : MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME;
}

function nextStreamValue(
  stream: PendingStream
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
  stream.rejectors.shift();
  if (resolve) {
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

function workerFetchParameters(): McapPlaybackWorkerFetchParameters {
  const { headers, origin, pathPrefix } = getFetchParameters();

  return {
    headers: mergeHeaders(headers),
    origin,
    pathPrefix,
  };
}

function mcapWorkerSourceKey(source: McapSourceDescriptor): string {
  return [
    source.readProfile ?? "",
    source.sourceId,
    source.url,
    source.sizeBytes ?? source.fingerprint?.sizeBytes ?? "",
    source.fingerprint?.firstChunkCrc?.toString() ?? "",
    source.fingerprint?.lastChunkCrc?.toString() ?? "",
  ].join("|");
}
