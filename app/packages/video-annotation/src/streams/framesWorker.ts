/**
 * Worker that owns `POST /frames` + per-image fetch + `createImageBitmap`
 * decode for `ImaVidImageStream`. Moves both the JSON parse and the
 * pixel decode off the main thread; ImageBitmaps are transferred back
 * (zero-copy) so the main thread can `drawImage` them onto a canvas
 * without a re-decode.
 *
 * Auth handling: on `init` we install `@fiftyone/utilities`'s fetch
 * singleton inside the worker scope with the same `(origin, headers,
 * pathPrefix)` the main thread uses. `/frames` requests then flow
 * through `getFrames` exactly as they do on the main thread. Token
 * refresh would require an `updateHeaders` message (looker's worker
 * has the same gap; deferred until needed).
 *
 * Wire protocol (all messages have a `type`):
 *
 *   main → worker:
 *     { type: "init", origin, pathPrefix, headers }      // once at start
 *     { type: "fetchChunk", reqId, request }             // per chunk
 *
 *   worker → main:
 *     { type: "frameReady", reqId, frameNumber, src, bitmap, width, height }
 *     { type: "chunkDone", reqId, range }                // all frames in chunk processed
 *     { type: "chunkFailed", reqId, error }              // top-level fetch / parse failure
 */

/// <reference lib="webworker" />

import { setFetchFunction } from "@fiftyone/utilities";
import {
  getFrames,
  type GetFramesRequest,
} from "../../../core/src/client/framesClient";

interface InitMessage {
  type: "init";
  origin: string;
  pathPrefix: string;
  headers: Record<string, string>;
}

interface FetchChunkMessage {
  type: "fetchChunk";
  reqId: number;
  request: GetFramesRequest;
}

type InboundMessage = InitMessage | FetchChunkMessage;

export interface FrameReadyMessage {
  type: "frameReady";
  reqId: number;
  frameNumber: number;
  src: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export interface ChunkDoneMessage {
  type: "chunkDone";
  reqId: number;
  range: [number, number];
}

export interface ChunkFailedMessage {
  type: "chunkFailed";
  reqId: number;
  error: string;
}

export type OutboundMessage =
  | FrameReadyMessage
  | ChunkDoneMessage
  | ChunkFailedMessage;

let initialized = false;
let origin = "";
let pathPrefix = "";

self.addEventListener("message", (event: MessageEvent<InboundMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      // Install the fetch singleton inside the worker's module scope.
      // Subsequent `getFrames` calls in this worker pick up the configured
      // origin / headers / pathPrefix.
      origin = msg.origin;
      pathPrefix = msg.pathPrefix;
      setFetchFunction(msg.origin, msg.headers ?? {}, msg.pathPrefix);
      initialized = true;
      break;

    case "fetchChunk":
      if (!initialized) {
        postFailed(msg.reqId, "framesWorker received fetchChunk before init");
        return;
      }
      void handleFetchChunk(msg);
      break;
  }
});

async function handleFetchChunk(msg: FetchChunkMessage): Promise<void> {
  let frames: Awaited<ReturnType<typeof getFrames>>;
  try {
    frames = await getFrames(msg.request);
  } catch (error) {
    postFailed(msg.reqId, errorMessage(error));
    return;
  }

  // Kick off every frame's fetch+decode in parallel; post each one as
  // soon as it's ready so the main-thread cache fills incrementally.
  await Promise.all(
    frames.frames.map((frame) => decodeAndDispatch(msg.reqId, frame))
  );

  postOutbound({
    type: "chunkDone",
    reqId: msg.reqId,
    range: frames.range,
  });
}

async function decodeAndDispatch(
  reqId: number,
  frame: { frame_number: number; filepath?: string }
): Promise<void> {
  if (!frame.filepath || typeof frame.filepath !== "string") {
    return;
  }

  const src = resolveMediaSrc(frame.filepath);

  let bitmap: ImageBitmap;
  try {
    // Match `<img src>` semantics for the media GET: no custom
    // headers, default credentials
    const r = await fetch(src, { mode: "cors" });

    if (!r.ok) {
      throw new Error(`image fetch failed: ${r.status}`);
    }

    const blob = await r.blob();
    bitmap = await createImageBitmap(blob);
  } catch (error) {
    // Skip — main-thread treats this frame as missing and the engine
    // re-requests on the next prefetch tick.
    console.error(
      `[framesWorker] decode failed for frame ${frame.frame_number}`,
      error
    );

    return;
  }

  postOutbound(
    {
      type: "frameReady",
      reqId,
      frameNumber: frame.frame_number,
      src,
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
    },
    [bitmap]
  );
}

/**
 * Mirror of `@fiftyone/state`'s `getSampleSrc`: passthrough for absolute
 * URLs / data: / blob: schemes; otherwise wrap as `/media?filepath=...`
 * using the worker-resolved origin + pathPrefix (set on `init`).
 */
function resolveMediaSrc(filepath: string): string {
  if (/^\w+:\/\//.test(filepath) || /^(data|blob):/.test(filepath)) {
    return filepath;
  }

  return `${joinUrl(
    origin,
    pathPrefix,
    "/media"
  )}?filepath=${encodeURIComponent(filepath)}`;
}

function joinUrl(origin: string, pathPrefix: string, suffix: string): string {
  return `${origin}${pathPrefix}${suffix}`.replace(/([^:]\/)\/+/g, "$1");
}

function postOutbound(msg: OutboundMessage, transfer?: Transferable[]): void {
  // self.postMessage's typing varies by lib; the cast is to the worker
  // DedicatedWorkerGlobalScope signature.
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    msg,
    transfer ?? []
  );
}

function postFailed(reqId: number, error: string): void {
  postOutbound({ type: "chunkFailed", reqId, error });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
