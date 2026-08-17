import { setFetchFunction } from "@fiftyone/utilities";
import { errorMessage } from "../../../utils/errors";
import { EPISODE_READ_CANCELLED_MESSAGE } from "../../../ports";
import {
  isMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerSynchronizedRequest,
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

    const result = await runMcapPlaybackWorkerUnaryRequest(mcap, message);
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
  const pendingPriorityTopics =
    message.type === "readSynchronizedMessages"
      ? new Set(
          (message.payload.settlementPriorityTopics ?? []).filter((topic) =>
            message.payload.topics.includes(topic),
          ),
        )
      : null;
  let holdingPrioritySettlements = (pendingPriorityTopics?.size ?? 0) > 0;
  let deliveredFirstPrioritySettlement = false;

  const acceptItem = (
    item: McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType],
  ): void => {
    throwIfWorkerRequestCancelled(signal);
    const transferables = transferablesForMcapResult(item);
    // The complete blocking prefix is one delivery boundary. Its ordered
    // per-topic items still hydrate independently on the host, while one
    // postMessage lets the playback store publish readiness in one browser
    // turn and transfers every payload exactly once.
    if (holdingPrioritySettlements) {
      if (
        !deliveredFirstPrioritySettlement &&
        isSynchronizedTopicSettlement(item) &&
        pendingPriorityTopics?.has(item.topic)
      ) {
        // The first presentation-priority surface is useful independently of
        // the remaining blocking group. Transfer it as soon as it is decoded;
        // the rest of the prefix still shares one readiness boundary.
        postStreamBatch(message.id, [item]);
        pendingPriorityTopics.delete(item.topic);
        deliveredFirstPrioritySettlement = true;
        if (pendingPriorityTopics.size === 0) {
          holdingPrioritySettlements = false;
        }
        return;
      }
      batch.push(item);
      batchBytes += estimateMcapStreamItemBytes(item);
      if (isSynchronizedTopicSettlement(item)) {
        pendingPriorityTopics?.delete(item.topic);
      }
      if ((pendingPriorityTopics?.size ?? 0) === 0) {
        postStreamBatch(message.id, batch);
        batch = [];
        batchBytes = 0;
        holdingPrioritySettlements = false;
      }
      return;
    }
    // A synchronized current-tick read has one more ownership boundary after
    // the blocking prefix: unresolved stragglers plus the payload-free
    // terminal. Keep that remainder together even when it owns transferable
    // buffers, so the host can accept it in one store turn without copying.
    if (message.type === "readSynchronizedMessages") {
      batch.push(item);
      batchBytes += estimateMcapStreamItemBytes(item);
      return;
    }
    // Outside the explicit priority boundary, transferable buffers keep their
    // per-item ownership boundary. Plain decoded records can share one
    // postMessage to reduce main-thread churn.
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
      return;
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
  };

  if (message.type === "readSynchronizedMessages") {
    await runMcapPlaybackWorkerSynchronizedRequest(
      mcap,
      message.payload,
      acceptItem,
    );
  } else {
    for await (const item of runMcapPlaybackWorkerStreamRequest(
      mcap,
      message,
    )) {
      acceptItem(item);
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

function isSynchronizedTopicSettlement(
  item: McapPlaybackWorkerStreamItemByType[McapPlaybackWorkerStreamType],
): item is Extract<
  McapPlaybackWorkerStreamItemByType["readSynchronizedMessages"],
  { readonly kind: "topic-settlement" }
> {
  return (
    typeof item === "object" &&
    item !== null &&
    "kind" in item &&
    item.kind === "topic-settlement"
  );
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
