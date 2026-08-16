import { setFetchFunction } from "@fiftyone/utilities";
import { errorMessage } from "../../../utils/errors";
import { EPISODE_READ_CANCELLED_MESSAGE } from "../../../ports";
import {
  isMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerUnaryRequest,
} from "./playback-worker-rpc";
import {
  McapPlaybackWorkerScheduler,
  type McapPlaybackWorkerRunContext,
} from "./playback-worker-scheduler";
import type { ByteReadDebugLog } from "../../../query/bytes";
import {
  emptyMcapBoundedReadUsage,
  isMcapBoundedReadCancelledError,
  McapBoundedReadCancelledError,
} from "../reader/bounded-read-cancellation";
import { createMcapTransportMeter } from "./transport-meter";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import {
  estimateMcapStreamItemBytes,
  isMcapStreamBatchFull,
  wouldOverflowMcapStreamBatch,
} from "./playback-worker-stream-batch";
import type {
  McapPlaybackWorkerRequest,
  McapPlaybackWorkerResponse,
  McapPlaybackWorkerRpcRequest,
  McapPlaybackWorkerStreamItemByType,
  McapPlaybackWorkerStreamType,
  McapPlaybackWorkerTransportResponse,
} from "./playback-worker-types";
import { createWorkerResourceClient } from "./worker-resource-client";

type McapPlaybackWorkerScope = {
  close(): void;
  onmessage: ((event: MessageEvent<McapPlaybackWorkerRequest>) => void) | null;
  postMessage(
    response: McapPlaybackWorkerResponse,
    transfer?: readonly Transferable[],
  ): void;
};

const workerScope = self as unknown as McapPlaybackWorkerScope;
const scheduler = new McapPlaybackWorkerScheduler();
const transportMeter = createMcapTransportMeter();
const TRANSPORT_PROGRESS_INTERVAL_MS = 500;
// This lane runs one request at a time, so one slot scopes byte reads to
// the active request's abort signal without threading it through the
// reader stack (@mcap/core reads carry no signal parameter).
const activeReadSignal: { current: AbortSignal | null } = { current: null };
const activeRetainedDecodedRecordIds: {
  current: ReadonlySet<string> | null;
} = { current: null };
let lastTransportProgressAtMs = -Infinity;

let activeSourceKey = "";
let fillSlotClass: "background" | "priority" | undefined;
let mcap = createMcapClient();

workerScope.onmessage = (event: MessageEvent<McapPlaybackWorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    setFetchFunction(
      message.payload.origin,
      message.payload.headers,
      message.payload.pathPrefix,
    );
    // Init always precedes the first read, so rebuilding the client here
    // gives every byte read this lane's declared fill-slot class.
    if (message.payload.fillSlotClass) {
      fillSlotClass = message.payload.fillSlotClass;
      mcap = createMcapClient();
    }
    scheduler.setDebug(false);
    return;
  }

  if (message.type === "cancel") {
    const cancellation = scheduler.cancel(message.id);
    if (cancellation.state === "queued") {
      postResponse({
        ...(cancellation.operation === "readBoundedMessages"
          ? {
              boundedReadCancellation: {
                usage: emptyMcapBoundedReadUsage(),
              },
            }
          : {}),
        error: EPISODE_READ_CANCELLED_MESSAGE,
        id: message.id,
        ok: false,
        transport: transportMeter.snapshot(),
      });
    }
    return;
  }

  if (message.type === "dispose") {
    scheduler.dispose();
    disposeAllClients();
    workerScope.close();
    return;
  }

  if (message.type === "releaseRetainedResources") {
    disposeAllClients();
    activeSourceKey = "";
    mcap = createMcapClient();
    return;
  }

  scheduler.enqueue({
    id: message.id,
    operation: message.type,
    priority: message.priority,
    run: (context) => runAndRespond(message, context),
    sourceKey: message.sourceKey,
  });
};

async function runAndRespond(
  message: McapPlaybackWorkerRpcRequest,
  context: McapPlaybackWorkerRunContext,
) {
  activeReadSignal.current = context.signal;
  activeRetainedDecodedRecordIds.current =
    message.retainedDecodedRecordIds === undefined
      ? null
      : new Set(message.retainedDecodedRecordIds);

  try {
    throwIfWorkerRequestCancelled(context.signal);
    ensureActiveSource(message.sourceKey);
    if (isMcapPlaybackWorkerStreamRequest(message)) {
      await streamRequest(message, context.signal);
      return;
    }

    let postedProgress = false;
    const result = await runMcapPlaybackWorkerUnaryRequest(
      mcap,
      message,
      message.type === "readSynchronizedMessages" &&
        message.payload.earlyDeliveryTopics?.length
        ? (progress) => {
            if (postedProgress) return;
            throwIfWorkerRequestCancelled(context.signal);
            postedProgress = true;
            // Clone the single early surface so the worker retains ownership
            // of every buffer until the complete union transfers normally.
            postResponse(
              {
                id: message.id,
                ok: true,
                progress: true,
                result: progress,
              },
              [],
            );
          }
        : undefined,
    );
    if (
      context.signal.aborted &&
      message.type === "readBoundedMessages" &&
      "usage" in result
    ) {
      throw new McapBoundedReadCancelledError(result.usage);
    }
    throwIfWorkerRequestCancelled(context.signal);
    const transferables = transferablesForMcapResult(result);
    postResponse(
      {
        id: message.id,
        ok: true,
        result,
        transport: transportMeter.snapshot(),
      },
      transferables,
    );
  } catch (error) {
    // A cancelled request reports the canonical marker no matter which read
    // the abort surfaced through, so consumers can treat it as benign.
    const messageText = context.signal.aborted
      ? EPISODE_READ_CANCELLED_MESSAGE
      : errorMessage(error);
    postResponse({
      ...(isMcapBoundedReadCancelledError(error)
        ? {
            boundedReadCancellation: {
              usage: error.usage,
            },
          }
        : {}),
      error: messageText,
      id: message.id,
      ok: false,
      transport: transportMeter.snapshot(),
    });
  } finally {
    activeReadSignal.current = null;
    activeRetainedDecodedRecordIds.current = null;
  }
}

async function streamRequest(
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType>,
  signal: AbortSignal,
) {
  let batch: McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType][] =
    [];
  let batchBytes = 0;

  for await (const item of runMcapPlaybackWorkerStreamRequest(mcap, message)) {
    throwIfWorkerRequestCancelled(signal);
    const transferables = transferablesForMcapResult(item);
    // Transferable buffers must keep their per-item ownership boundary. Plain
    // decoded records can share one postMessage to reduce main-thread churn.
    if (transferables.length > 0) {
      postStreamBatch(message.id, batch);
      batch = [];
      batchBytes = 0;
      postResponse(
        {
          done: false,
          id: message.id,
          item,
          ok: true,
          stream: true,
        },
        transferables,
      );
      continue;
    }

    const itemBytes = estimateMcapStreamItemBytes(item);
    if (
      wouldOverflowMcapStreamBatch({
        batchBytes,
        batchItems: batch.length,
        nextItemBytes: itemBytes,
      })
    ) {
      postStreamBatch(message.id, batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(item);
    batchBytes += itemBytes;
    if (
      isMcapStreamBatchFull({
        batchBytes,
        batchItems: batch.length,
      })
    ) {
      postStreamBatch(message.id, batch);
      batch = [];
      batchBytes = 0;
    }
  }
  throwIfWorkerRequestCancelled(signal);
  postStreamBatch(message.id, batch);

  postResponse({
    done: true,
    id: message.id,
    ok: true,
    stream: true,
    transport: transportMeter.snapshot(),
  });
}

function throwIfWorkerRequestCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error(EPISODE_READ_CANCELLED_MESSAGE);
  }
}

function postStreamBatch(
  id: number,
  items: readonly McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType][],
) {
  if (items.length === 0) {
    return;
  }

  postResponse({
    done: false,
    id,
    items,
    ok: true,
    stream: true,
  });
}

// Adjacent-sample navigation flips between a small set of sources; a parked
// client keeps its initialized reader (summary parse, message indexes) and
// decode caches so returning to that sample skips the cold init entirely.
const MAX_PARKED_SOURCE_CLIENTS = 1;
const parkedClients = new Map<string, ReturnType<typeof createMcapClient>>();

function ensureActiveSource(sourceKey: string) {
  if (activeSourceKey === sourceKey) {
    return;
  }

  if (activeSourceKey !== "") {
    parkedClients.set(activeSourceKey, mcap);
  } else {
    // The bootstrap client never served a source; nothing worth keeping.
    mcap.dispose();
  }
  activeSourceKey = sourceKey;

  const warm = parkedClients.get(sourceKey);
  if (warm) {
    parkedClients.delete(sourceKey);
    mcap = warm;
    return;
  }

  mcap = createMcapClient();
  while (parkedClients.size > MAX_PARKED_SOURCE_CLIENTS) {
    const oldest = parkedClients.keys().next().value;
    if (oldest === undefined) break;
    parkedClients.get(oldest)?.dispose();
    parkedClients.delete(oldest);
  }
}

function disposeAllClients() {
  mcap.dispose();
  for (const parked of parkedClients.values()) {
    parked.dispose();
  }
  parkedClients.clear();
}

function createMcapClient() {
  return createWorkerResourceClient({
    ...(fillSlotClass ? { fillSlotClass } : {}),
    onByteRead: handleByteRead,
    readSignal: activeReadSignal,
    retainedDecodedRecordIds: activeRetainedDecodedRecordIds,
  });
}

function handleByteRead(entry: ByteReadDebugLog) {
  transportMeter.onByteRead(entry);
  maybePostTransportProgress();
}

function maybePostTransportProgress() {
  const now = workerNowMs();
  if (now - lastTransportProgressAtMs < TRANSPORT_PROGRESS_INTERVAL_MS) {
    return;
  }

  lastTransportProgressAtMs = now;
  postResponse({
    ok: true,
    transport: transportMeter.snapshot(),
    type: "transport",
  });
}

function postResponse(
  response: McapPlaybackWorkerResponse,
  transferables = transferablesForResponse(response),
) {
  workerScope.postMessage(response, transferables);
}

function transferablesForResponse(response: McapPlaybackWorkerResponse) {
  if (isTransportResponse(response)) {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  if ("stream" in response) {
    if (response.done) {
      return [];
    }
    return transferablesForMcapResult(
      "items" in response ? response.items : response.item,
    );
  }

  return transferablesForMcapResult(response.result);
}

function workerNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isTransportResponse(
  response: McapPlaybackWorkerResponse,
): response is McapPlaybackWorkerTransportResponse {
  return "type" in response && response.type === "transport";
}
