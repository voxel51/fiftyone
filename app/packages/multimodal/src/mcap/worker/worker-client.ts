import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import {
  byteSourceCacheKey,
  serializeCacheKey,
} from "../../client/resources/cache";
import type { ByteSourceDescriptor } from "../../client";
import { createMcapResourceClient } from "../resources";
import { runMcapPlaybackWorkerStreamRequest } from "./playback-worker-rpc";
import { McapPlaybackWorkerTransport } from "./playback-worker-transport";
import {
  type McapPlaybackWorkerFetchParameters,
  type McapPlaybackWorkerRequest,
  type McapPlaybackWorkerRequestPayloadByType,
  type McapPlaybackWorkerResponse,
  type McapPlaybackWorkerResultByType,
  type McapPlaybackWorkerStreamItemByType,
  type McapPlaybackWorkerStreamType,
  type McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTimelineRangeRequest,
  McapResourceClient,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";
import type { StreamInventory } from "../../schemas/v1";

const INLINE_WORKER_REQUEST_ID = 0;
const INLINE_WORKER_REQUEST_PRIORITY = 0;
const INLINE_WORKER_SOURCE_KEY = "inline";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export interface CreateWorkerMcapResourceClientOptions {
  readonly fallback?: "error" | "inline";
  readonly workerFactory?: () => Worker;
}

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
  private inlineClient: McapResourceClient | undefined;
  private readonly transport = new McapPlaybackWorkerTransport(
    (sourceKey) => this.activeSourceKey === sourceKey
  );
  private worker: Worker | undefined;

  constructor(
    private readonly options: CreateWorkerMcapResourceClientOptions
  ) {}

  dispose() {
    this.disposed = true;
    this.resetWorker("MCAP worker disposed");
    this.inlineClient?.dispose();
    this.inlineClient = undefined;
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

  readTimelineRange(
    request: McapReadTimelineRangeRequest
  ): Promise<McapTimelineRange> {
    return this.request("readTimelineRange", request);
  }

  readTopics(
    request: McapReadTopicsRequest
  ): Promise<readonly StreamInventory[]> {
    return this.request("readTopics", request);
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
    payload: McapPlaybackWorkerRequestPayloadByType[Type]
  ): Promise<McapPlaybackWorkerResultByType[Type]> {
    if (this.disposed) {
      return Promise.reject(new Error("MCAP worker client is disposed"));
    }

    const sourceKey = mcapWorkerSourceKey(payload.source);
    const target = this.workerForSource(sourceKey);
    if (!isWorker(target)) {
      return requestInlineClient(target, type, payload);
    }

    return this.transport.request(target, sourceKey, type, payload);
  }

  private async *streamRequest<Type extends McapPlaybackWorkerStreamType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type]
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }

    const sourceKey = mcapWorkerSourceKey(payload.source);
    const target = this.workerForSource(sourceKey);
    if (!isWorker(target)) {
      yield* streamInlineClient(target, type, payload);
      return;
    }

    yield* this.transport.stream(target, sourceKey, type, payload);
  }

  private workerForSource(sourceKey: string): Worker | McapResourceClient {
    if (this.worker && this.activeSourceKey === sourceKey) {
      return this.worker;
    }

    this.resetWorker("MCAP worker reset for a different source");
    let worker: Worker | undefined;
    try {
      worker = this.createWorker();
      const initRequest: McapPlaybackWorkerRequest = {
        payload: workerFetchParameters(),
        type: "init",
      };
      worker.postMessage(initRequest);
    } catch (error) {
      disposeWorker(worker);
      this.resetWorker(errorMessage(error, "MCAP worker startup failed"));
      if (this.options.fallback === "inline") {
        return this.createMcapResourceClient();
      }

      throw error instanceof Error ? error : new Error(String(error));
    }

    this.activeSourceKey = sourceKey;
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<McapPlaybackWorkerResponse>) =>
      this.transport.handleResponse(event.data);
    this.worker.onerror = (event) => {
      this.resetWorker(event.message || "MCAP worker error");
    };

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

    this.transport.rejectAll(reason);
  }

  private createMcapResourceClient(): McapResourceClient {
    this.inlineClient ??= createMcapResourceClient();

    return this.inlineClient;
  }
}

function isWorker(target: Worker | McapResourceClient): target is Worker {
  return "postMessage" in target;
}

function requestInlineClient<Type extends McapPlaybackWorkerUnaryType>(
  client: McapResourceClient,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type]
): Promise<McapPlaybackWorkerResultByType[Type]> {
  switch (type) {
    case "readSynchronizedMessageBatch":
      return client.readSynchronizedMessageBatch(
        payload as McapReadSynchronizedMessageBatchRequest
      ) as Promise<McapPlaybackWorkerResultByType[Type]>;
    case "readSynchronizedMessages":
      return client.readSynchronizedMessages(
        payload as McapReadSynchronizedMessagesRequest
      ) as Promise<McapPlaybackWorkerResultByType[Type]>;
    case "readTimelineRange":
      return client.readTimelineRange(
        payload as McapReadTimelineRangeRequest
      ) as Promise<McapPlaybackWorkerResultByType[Type]>;
    case "readTopics":
      return client.readTopics(payload as McapReadTopicsRequest) as Promise<
        McapPlaybackWorkerResultByType[Type]
      >;
  }

  throw new Error(`Unsupported MCAP worker operation ${type}`);
}

async function* streamInlineClient<Type extends McapPlaybackWorkerStreamType>(
  client: McapResourceClient,
  type: Type,
  payload: McapPlaybackWorkerRequestPayloadByType[Type]
): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
  yield* runMcapPlaybackWorkerStreamRequest(client, {
    id: INLINE_WORKER_REQUEST_ID,
    payload,
    priority: INLINE_WORKER_REQUEST_PRIORITY,
    sourceKey: INLINE_WORKER_SOURCE_KEY,
    type,
  });
}

function disposeWorker(worker: Worker | undefined) {
  if (!worker) {
    return;
  }

  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function workerFetchParameters(): McapPlaybackWorkerFetchParameters {
  const { headers, origin, pathPrefix } = getFetchParameters();

  return {
    headers: mergeHeaders(headers),
    origin,
    pathPrefix,
  };
}

function mcapWorkerSourceKey(source: ByteSourceDescriptor): string {
  return serializeCacheKey([
    source.readProfile ?? null,
    byteSourceCacheKey(source),
  ]);
}
