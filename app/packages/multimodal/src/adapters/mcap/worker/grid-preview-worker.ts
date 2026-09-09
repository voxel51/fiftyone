import { setFetchFunction } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { throwIfAborted } from "../../../utils/cancellation";
import { errorMessage } from "../../../utils/errors";
import {
  decodeGridPreview,
  type McapGridPreviewEntry,
} from "../resource-client/grid-preview";
import {
  McapPlaybackWorkerScheduler,
  type McapPlaybackWorkerRunContext,
} from "./playback-worker-scheduler";
import { createWorkerResourceClient } from "./worker-resource-client";
import type {
  McapGridPreviewWorkerRequest,
  McapGridPreviewWorkerResponse,
  McapGridPreviewWorkerRpcRequest,
} from "./grid-preview-worker-types";

// Visibility-gated loading keeps the active set near one dense viewport. A
// 24-source limit still covers the observed one-worker viewport while bounding
// reader/index and per-client byte-cache memory to 120 sources across 5 lanes.
const GRID_PREVIEW_SOURCE_CACHE_LIMIT = 24;

type McapGridPreviewWorkerScope = {
  close(): void;
  onmessage:
    | ((event: MessageEvent<McapGridPreviewWorkerRequest>) => void)
    | null;
  postMessage(
    response: McapGridPreviewWorkerResponse,
    transfer?: readonly Transferable[],
  ): void;
};

const workerScope = self as unknown as McapGridPreviewWorkerScope;
const scheduler = new McapPlaybackWorkerScheduler();
// Grid requests are serialized by `scheduler`, so all cached source readers
// can safely consult one mutable request-signal slot. Cancellation then stops
// request-owned demand reads without rebuilding the per-source reader cache.
// The byte cache's bounded autonomous readahead intentionally omits this
// signal: it remains background-only and reusable by a same-range modal read.
const activeReadSignal: { current: AbortSignal | null } = { current: null };
let fillSlotClass: "background" | "priority" | undefined;
// Each grid preview slot serves many sources (one per visible grid cell), so
// keep a bounded per-source cache of readers and stream selections.
const entries = new LRUCache<string, McapGridPreviewEntry>({
  max: GRID_PREVIEW_SOURCE_CACHE_LIMIT,
  dispose: (entry) => {
    entry.client.dispose();
  },
});

workerScope.onmessage = (event: MessageEvent<McapGridPreviewWorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    setFetchFunction(
      message.payload.origin,
      message.payload.headers,
      message.payload.pathPrefix,
    );
    fillSlotClass = message.payload.fillSlotClass;
    return;
  }

  if (message.type === "cancel") {
    scheduler.cancel(message.id);
    return;
  }

  if (message.type === "dispose") {
    scheduler.dispose();
    entries.clear();
    workerScope.close();
    return;
  }

  scheduler.enqueue({
    id: message.id,
    priority: message.priority,
    run: (context) => runAndRespond(message, context),
    sourceKey: message.sourceKey,
  });
};

async function runAndRespond(
  message: McapGridPreviewWorkerRpcRequest,
  context: McapPlaybackWorkerRunContext,
) {
  activeReadSignal.current = context.signal;
  try {
    throwIfAborted(context.signal);
    const result = await decodeGridPreview(
      entryForSource(message.sourceKey),
      message.payload,
    );
    throwIfAborted(context.signal);

    postResponse({
      id: message.id,
      ok: true,
      result,
    });
  } catch (error) {
    postResponse({
      error: errorMessage(error),
      id: message.id,
      ok: false,
    });
  } finally {
    activeReadSignal.current = null;
  }
}

function entryForSource(sourceKey: string): McapGridPreviewEntry {
  const cached = entries.get(sourceKey);
  if (cached) {
    return cached;
  }

  const entry = {
    client: createWorkerResourceClient({
      ...(fillSlotClass ? { fillSlotClass } : {}),
      readSignal: activeReadSignal,
    }),
  };
  entries.set(sourceKey, entry);

  return entry;
}

function postResponse(response: McapGridPreviewWorkerResponse) {
  workerScope.postMessage(response, transferablesForResponse(response));
}

function transferablesForResponse(
  response: McapGridPreviewWorkerResponse,
): Transferable[] {
  if (!response.ok) {
    return [];
  }

  const frame = response.result.state.frame;
  if (frame?.kind === "image") {
    return transferableBuffers(
      frame.image.kind === "raw-image"
        ? (frame.image.depth?.values ?? frame.image.rgba)
        : frame.image.bytes,
    );
  }

  if (frame?.kind === "point-cloud") {
    return transferableBuffers(
      frame.pointCloud.positions,
      frame.pointCloud.colors,
      ...(frame.pointCloud.scalarFields?.map((field) => field.values) ?? []),
      frame.pointCloud.renderPayload?.positions,
      frame.pointCloud.renderPayload?.rgb?.values,
      frame.pointCloud.renderPayload?.sourceIndices,
      ...(frame.pointCloud.renderPayload?.scalarFields.map(
        (field) => field.values,
      ) ?? []),
    );
  }

  return [];
}

function transferableBuffers(
  ...views: readonly (ArrayBufferView | undefined)[]
): Transferable[] {
  const buffers = new Set<ArrayBuffer>();

  for (const view of views) {
    if (view?.buffer instanceof ArrayBuffer) {
      buffers.add(view.buffer);
    }
  }

  return [...buffers];
}
