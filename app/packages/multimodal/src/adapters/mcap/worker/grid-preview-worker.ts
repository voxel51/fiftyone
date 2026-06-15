import { setFetchFunction } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { mcapErrorMessage } from "../errors";
import { decodeGridPreview, type McapGridPreviewEntry } from "../grid-preview";
import { McapPlaybackWorkerScheduler } from "./playback-worker-scheduler";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import { createWorkerResourceClient } from "./worker-resource-client";
import type {
  McapGridPreviewWorkerRequest,
  McapGridPreviewWorkerResponse,
  McapGridPreviewWorkerRpcRequest,
} from "./grid-preview-worker-types";

const GRID_PREVIEW_SOURCE_CACHE_LIMIT = 24;

type McapGridPreviewWorkerScope = {
  close(): void;
  onmessage:
    | ((event: MessageEvent<McapGridPreviewWorkerRequest>) => void)
    | null;
  postMessage(
    response: McapGridPreviewWorkerResponse,
    transfer?: readonly Transferable[]
  ): void;
};

const workerScope = self as unknown as McapGridPreviewWorkerScope;
const scheduler = new McapPlaybackWorkerScheduler();
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
      message.payload.pathPrefix
    );
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
    priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
    run: () => runAndRespond(message),
    sourceKey: message.sourceKey,
  });
};

async function runAndRespond(message: McapGridPreviewWorkerRpcRequest) {
  try {
    const result = await decodeGridPreview(
      entryForSource(message.sourceKey),
      message.payload
    );

    postResponse({
      id: message.id,
      ok: true,
      result,
    });
  } catch (error) {
    postResponse({
      error: mcapErrorMessage(error),
      id: message.id,
      ok: false,
    });
  }
}

function entryForSource(sourceKey: string): McapGridPreviewEntry {
  const cached = entries.get(sourceKey);
  if (cached) {
    return cached;
  }

  const entry = { client: createWorkerResourceClient() };
  entries.set(sourceKey, entry);

  return entry;
}

function postResponse(response: McapGridPreviewWorkerResponse) {
  workerScope.postMessage(response, transferablesForResponse(response));
}

function transferablesForResponse(
  response: McapGridPreviewWorkerResponse
): Transferable[] {
  if (!response.ok) {
    return [];
  }

  const frame = response.result.state.frame;
  if (frame?.kind === "image") {
    return transferableBuffers(frame.image.bytes);
  }

  if (frame?.kind === "point-cloud") {
    return transferableBuffers(
      frame.pointCloud.positions,
      frame.pointCloud.colors,
      ...(frame.pointCloud.scalarFields?.map((field) => field.values) ?? [])
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
