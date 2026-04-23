import type {
  FetchMultimodalBufferParams,
  MultimodalRawBufferResponse,
  MultimodalRawBufferResponseStream,
  MultimodalTimeRange,
} from "./types";

type StreamWindowBatchLoaderOptions = {
  datasetId: string;
  sampleId: string;
  mediaField: string;
  sourceKind?: string;
  loadBuffer?: (
    params: FetchMultimodalBufferParams
  ) => Promise<MultimodalRawBufferResponse>;
};

type BatchCollector = {
  window: MultimodalTimeRange;
  resolvers: Map<
    string,
    {
      resolve: (stream: MultimodalRawBufferResponseStream | null) => void;
      reject: (error: unknown) => void;
    }
  >;
};

async function loadDefaultBuffer(params: FetchMultimodalBufferParams) {
  const { fetchMultimodalBuffer } = await import("./api");
  return fetchMultimodalBuffer(params);
}

function getWindowKey(window: MultimodalTimeRange) {
  return `${window.startNs}:${window.endNs}`;
}

function getStreamWindowKey(streamId: string, window: MultimodalTimeRange) {
  return `${streamId}:${getWindowKey(window)}`;
}

/**
 * Creates a per-stream raw-window loader that batches same-window requests
 * together into one transport call while preserving per-stream promise
 * semantics for the existing caches.
 */
export function createMultimodalStreamWindowBatchLoader(
  options: StreamWindowBatchLoaderOptions
) {
  const fetchBuffer = options.loadBuffer ?? loadDefaultBuffer;
  const collectors = new Map<string, BatchCollector>();
  const inFlightStreamLoads = new Map<
    string,
    Promise<MultimodalRawBufferResponseStream | null>
  >();

  const flushCollector = async (
    collectorKey: string,
    collector: BatchCollector
  ) => {
    if (collectors.get(collectorKey) !== collector) {
      return;
    }

    collectors.delete(collectorKey);
    const streamIds = Array.from(collector.resolvers.keys());

    try {
      const response = await fetchBuffer({
        datasetId: options.datasetId,
        sampleId: options.sampleId,
        request: {
          mediaField: options.mediaField,
          sourceKind: options.sourceKind,
          streamIds,
          startTimeNs: collector.window.startNs,
          endTimeNs: collector.window.endNs,
          mode: "raw",
        },
      });
      const streamMap = new Map(
        response.streams.map((stream) => [stream.streamId, stream] as const)
      );

      collector.resolvers.forEach(({ resolve }, streamId) => {
        resolve(streamMap.get(streamId) ?? null);
      });
    } catch (error) {
      collector.resolvers.forEach(({ reject }) => {
        reject(error);
      });
    }
  };

  return (streamId: string, window: MultimodalTimeRange) => {
    const streamWindowKey = getStreamWindowKey(streamId, window);
    const existingLoad = inFlightStreamLoads.get(streamWindowKey);
    if (existingLoad) {
      return existingLoad;
    }

    const collectorKey = getWindowKey(window);
    let collector = collectors.get(collectorKey);
    if (!collector) {
      collector = {
        window,
        resolvers: new Map(),
      };
      collectors.set(collectorKey, collector);
      queueMicrotask(() => {
        void flushCollector(collectorKey, collector);
      });
    }

    const loadPromise = new Promise<MultimodalRawBufferResponseStream | null>(
      (resolve, reject) => {
        collector?.resolvers.set(streamId, {
          resolve,
          reject,
        });
      }
    ).finally(() => {
      if (inFlightStreamLoads.get(streamWindowKey) === loadPromise) {
        inFlightStreamLoads.delete(streamWindowKey);
      }
    });

    inFlightStreamLoads.set(streamWindowKey, loadPromise);
    return loadPromise;
  };
}
