import { setFetchFunction } from "@fiftyone/utilities";
import {
  createMultimodalResourcesClient,
  type DecodedOutputCache,
} from "../../client/resources";
import { createMcapResourceClient } from "../resources";
import {
  isMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerStreamRequest,
  runMcapPlaybackWorkerUnaryRequest,
} from "./playback-worker-rpc";
import { McapPlaybackWorkerScheduler } from "./playback-worker-scheduler";
import { transferablesForMcapResult } from "./playback-worker-transfer";
import type {
  McapPlaybackWorkerRequest,
  McapPlaybackWorkerRpcRequest,
  McapPlaybackWorkerStreamType,
} from "./playback-worker-types";
import type { McapResourceClient } from "../types";

type McapPlaybackWorkerPostResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly done: false;
      readonly id: number;
      readonly item: unknown;
      readonly ok: true;
      readonly stream: true;
    }
  | {
      readonly done: true;
      readonly id: number;
      readonly ok: true;
      readonly stream: true;
    }
  | {
      readonly error: string;
      readonly id: number;
      readonly ok: false;
    };

type McapPlaybackWorkerScope = {
  close(): void;
  onmessage: ((event: MessageEvent<McapPlaybackWorkerRequest>) => void) | null;
  postMessage(
    response: McapPlaybackWorkerPostResponse,
    transfer?: readonly Transferable[]
  ): void;
};

const workerScope = self as unknown as McapPlaybackWorkerScope;
const scheduler = new McapPlaybackWorkerScheduler();

let activeSourceKey = "";
let mcap = createWorkerResourceClient();

workerScope.onmessage = (event: MessageEvent<McapPlaybackWorkerRequest>) => {
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
    mcap.dispose();
    workerScope.close();
    return;
  }

  scheduler.enqueue({
    id: message.id,
    priority: message.priority,
    run: () => runAndRespond(message),
    sourceKey: message.sourceKey,
  });
};

async function runAndRespond(message: McapPlaybackWorkerRpcRequest) {
  try {
    ensureActiveSource(message.sourceKey);
    if (isMcapPlaybackWorkerStreamRequest(message)) {
      await streamRequest(message);
      return;
    }

    const result = await runMcapPlaybackWorkerUnaryRequest(mcap, message);
    postResponse({
      id: message.id,
      ok: true,
      result,
    });
  } catch (error) {
    postResponse({
      error: error instanceof Error ? error.message : String(error),
      id: message.id,
      ok: false,
    });
  }
}

async function streamRequest(
  message: McapPlaybackWorkerRpcRequest<McapPlaybackWorkerStreamType>
) {
  for await (const item of runMcapPlaybackWorkerStreamRequest(mcap, message)) {
    postResponse({
      done: false,
      id: message.id,
      item,
      ok: true,
      stream: true,
    });
  }

  postResponse({
    done: true,
    id: message.id,
    ok: true,
    stream: true,
  });
}

function ensureActiveSource(sourceKey: string) {
  if (activeSourceKey === sourceKey) {
    return;
  }

  activeSourceKey = sourceKey;
  mcap.dispose();
  mcap = createWorkerResourceClient();
}

function postResponse(response: McapPlaybackWorkerPostResponse) {
  workerScope.postMessage(response, transferablesForResponse(response));
}

function transferablesForResponse(response: McapPlaybackWorkerPostResponse) {
  if (!response.ok) {
    return [];
  }

  if ("stream" in response) {
    return response.done ? [] : transferablesForMcapResult(response.item);
  }

  return transferablesForMcapResult(response.result);
}

function createWorkerResourceClient(): McapResourceClient {
  return createMcapResourceClient({
    resources: createMultimodalResourcesClient({
      caches: {
        decoded: createTransferSafeNoopDecodedOutputCache(),
      },
    }),
  });
}

function createTransferSafeNoopDecodedOutputCache(): DecodedOutputCache {
  // Decoded visualization buffers are transferred to the UI thread. Reusing
  // worker-cached decoded results would either return detached buffers or force
  // extra clones, so playback-window reuse belongs on the main thread.
  return {
    clear() {
      return Promise.resolve();
    },
    get() {
      return Promise.resolve(undefined);
    },
    put() {
      return Promise.resolve();
    },
  };
}
