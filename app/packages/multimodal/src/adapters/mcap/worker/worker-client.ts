import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { byteSourceAccessKey } from "../../../query/bytes";
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
import { mcapError, mcapErrorMessage } from "../errors";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadStaticTransformsRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTimelineRangeRequest,
  McapResourceClient,
  McapStaticTransformGraph,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";
import type { StreamInventory } from "../../../schemas/v1";

/**
 * Options for creating a worker-backed MCAP resource client.
 */
export interface CreateWorkerMcapResourceClientOptions {
  readonly workerFactory?: () => Worker;
}

/**
 * Creates a worker-backed MCAP resource client for synchronized playback.
 */
export function createWorkerMcapResourceClient(
  options: CreateWorkerMcapResourceClientOptions = {}
): McapResourceClient {
  if (!options.workerFactory && typeof Worker === "undefined") {
    throw new Error("MCAP playback workers are not available");
  }

  return new WorkerMcapResourceClient(options);
}

class WorkerMcapResourceClient implements McapResourceClient {
  private activeSourceKey = "";
  private disposed = false;
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

  readStaticTransforms(
    request: McapReadStaticTransformsRequest
  ): Promise<McapStaticTransformGraph> {
    return this.request("readStaticTransforms", request);
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

    const sourceKey = byteSourceAccessKey(payload.source);
    return this.transport.request(
      this.workerForSource(sourceKey),
      sourceKey,
      type,
      payload
    );
  }

  private async *streamRequest<Type extends McapPlaybackWorkerStreamType>(
    type: Type,
    payload: McapPlaybackWorkerRequestPayloadByType[Type]
  ): AsyncGenerator<McapPlaybackWorkerStreamItemByType[Type], void, void> {
    if (this.disposed) {
      throw new Error("MCAP worker client is disposed");
    }

    const sourceKey = byteSourceAccessKey(payload.source);
    yield* this.transport.stream(
      this.workerForSource(sourceKey),
      sourceKey,
      type,
      payload
    );
  }

  private workerForSource(sourceKey: string): Worker {
    if (this.worker && this.activeSourceKey === sourceKey) {
      return this.worker;
    }

    this.resetWorker("MCAP worker reset for a different source");
    let worker: Worker | undefined;
    try {
      worker = this.createWorker();
      // Wire handlers before init so a synchronous postMessage failure or very
      // early worker response goes through the same transport/reset paths.
      this.activeSourceKey = sourceKey;
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<McapPlaybackWorkerResponse>) =>
        this.transport.handleResponse(event.data);
      worker.onerror = (event) => {
        this.resetWorker(event.message || "MCAP worker error");
      };

      const initRequest: McapPlaybackWorkerRequest = {
        payload: workerFetchParameters(),
        type: "init",
      };
      worker.postMessage(initRequest);
    } catch (error) {
      if (this.worker === worker) {
        this.resetWorker(mcapErrorMessage(error, "MCAP worker startup failed"));
      } else {
        disposeWorker(worker);
      }
      throw mcapError(error);
    }

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
}

function disposeWorker(worker: Worker | undefined) {
  if (!worker) {
    return;
  }

  worker.onmessage = null;
  worker.onerror = null;
  worker.terminate();
}

function workerFetchParameters(): McapPlaybackWorkerFetchParameters {
  const { headers, origin, pathPrefix } = getFetchParameters();

  return {
    headers: mergeHeaders(headers),
    origin,
    pathPrefix,
  };
}
