import { setFetchFunction } from "@fiftyone/utilities";
import { MCAP_READ_CANCELLED_MESSAGE, mcapErrorMessage } from "../errors";
import {
  isMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerUnaryRequest,
} from "./playback-worker-rpc";
import {
  McapPlaybackWorkerScheduler,
  type McapPlaybackWorkerRunContext,
} from "./playback-worker-scheduler";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import {
  createMcapPlaybackWorkerAttributionCollector,
  type McapPlaybackWorkerAttributionCollector,
  type McapPlaybackWorkerLaneName,
} from "./playback-worker-attribution";
import type { McapChunkReadDebugLog } from "../reader";
import type {
  McapPlaybackWorkerRequest,
  McapPlaybackWorkerResponse,
  McapPlaybackWorkerRpcRequest,
  McapPlaybackWorkerStreamType,
} from "./playback-worker-types";
import { createMcapTransportMeter } from "./transport-meter";
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
// One meter for the worker's lifetime: counters are cumulative so the main
// thread can diff snapshots across source changes and client recreation.
const transportMeter = createMcapTransportMeter();
// This lane runs one request at a time, so one slot scopes byte reads to
// the active request's abort signal without threading it through the
// reader stack (@mcap/core reads carry no signal parameter).
const activeReadSignal: { current: AbortSignal | null } = { current: null };

let activeSourceKey = "";
let activeAttribution: McapPlaybackWorkerAttributionCollector | null = null;
let debugReads = false;
let lane: McapPlaybackWorkerLaneName = "foreground";
let mcap = createMcapClient();

workerScope.onmessage = (event: MessageEvent<McapPlaybackWorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    setFetchFunction(
      message.payload.origin,
      message.payload.headers,
      message.payload.pathPrefix,
    );
    const nextDebugReads = message.payload.latencyDebug === true;
    lane = message.payload.lane ?? "foreground";
    scheduler.setDebug(nextDebugReads);
    if (debugReads !== nextDebugReads) {
      debugReads = nextDebugReads;
      activeSourceKey = "";
      mcap.dispose();
      mcap = createMcapClient();
    }
    return;
  }

  if (message.type === "cancel") {
    scheduler.cancel(message.id);
    return;
  }

  if (message.type === "dispose") {
    scheduler.dispose();
    mcap.dispose();
    workerScope.close();
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
  const attribution = debugReads
    ? createMcapPlaybackWorkerAttributionCollector(message, {
        lane,
        queueDepthAtStart: context.queueDepthAtStart,
        queueWaitMs: context.queueWaitMs,
        sourceKey: message.sourceKey,
        startedAtMs: context.startedAtMs,
      })
    : null;
  const previousAttribution = activeAttribution;
  activeAttribution = attribution;
  activeReadSignal.current = context.signal;

  try {
    ensureActiveSource(message.sourceKey);
    if (isMcapPlaybackWorkerStreamRequest(message)) {
      await streamRequest(message, attribution);
      return;
    }

    const result = await runMcapPlaybackWorkerUnaryRequest(mcap, message);
    const transferables = transferablesForMcapResult(result);
    attribution?.recordResult(result, transferables.length);
    postResponse(
      {
        ...(attribution
          ? {
              debugAttribution: attribution.finish({
                nowMs: workerNowMs(),
                ok: true,
              }),
            }
          : {}),
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
    const errorMessage = context.signal.aborted
      ? MCAP_READ_CANCELLED_MESSAGE
      : mcapErrorMessage(error);
    postResponse({
      ...(attribution
        ? {
            debugAttribution: attribution.finish({
              error: errorMessage,
              nowMs: workerNowMs(),
              ok: false,
            }),
          }
        : {}),
      error: errorMessage,
      id: message.id,
      ok: false,
      transport: transportMeter.snapshot(),
    });
  } finally {
    activeReadSignal.current = null;
    activeAttribution = previousAttribution;
  }
}

async function streamRequest(
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType>,
  attribution: McapPlaybackWorkerAttributionCollector | null,
) {
  for await (const item of runMcapPlaybackWorkerStreamRequest(mcap, message)) {
    const transferables = transferablesForMcapResult(item);
    attribution?.recordResult(item, transferables.length);
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
  }

  postResponse({
    ...(attribution
      ? {
          debugAttribution: attribution.finish({
            nowMs: workerNowMs(),
            ok: true,
          }),
        }
      : {}),
    done: true,
    id: message.id,
    ok: true,
    stream: true,
    transport: transportMeter.snapshot(),
  });
}

function ensureActiveSource(sourceKey: string) {
  if (activeSourceKey === sourceKey) {
    return;
  }

  activeSourceKey = sourceKey;
  mcap.dispose();
  mcap = createMcapClient();
}

function createMcapClient() {
  return createWorkerResourceClient({
    debugByteReads: debugReads,
    debugChunkReads: debugReads,
    logChunkRead: logChunkReadForActiveRequest,
    onByteRead: transportMeter.onByteRead,
    readSignal: activeReadSignal,
  });
}

function logChunkReadForActiveRequest(entry: McapChunkReadDebugLog): void {
  if (debugReads) {
    console.log("[mcap] chunk bytes fetched", entry);
  }
  activeAttribution?.recordChunkRead(entry);
}

function postResponse(
  response: McapPlaybackWorkerResponse,
  transferables = transferablesForResponse(response),
) {
  workerScope.postMessage(response, transferables);
}

function transferablesForResponse(response: McapPlaybackWorkerResponse) {
  if (!response.ok) {
    return [];
  }

  if ("stream" in response) {
    return response.done ? [] : transferablesForMcapResult(response.item);
  }

  return transferablesForMcapResult(response.result);
}

function workerNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
