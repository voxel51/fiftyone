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
 *     { type: "frameReady", reqId, frameNumber, bitmap, width, height, meta: { src, filepath } }
 *     { type: "chunkDone", reqId, range }                // all frames in chunk processed
 *     { type: "chunkFailed", reqId, error }              // top-level fetch / parse failure
 *
 * The worker → main messages follow the shared {@link ./frameWorkerProtocol}
 * so the `FrameBitmapStream` base can consume this and the WebCodecs worker
 * through one contract.
 */

/// <reference lib="webworker" />

import { setFetchFunction } from "@fiftyone/utilities";
import {
  getFrames,
  type GetFramesRequest,
} from "../../../core/src/client/framesClient";
import type {
  FrameWorkerOutbound,
  InitMessage as BaseInitMessage,
} from "./frameWorkerProtocol";

/** Source-specific `init` for the `/frames` worker: the fetch context. */
interface InitMessage extends BaseInitMessage {
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
    frames.frames.map((frame) => decodeAndDispatch(msg.reqId, frame)),
  );

  postOutbound({
    type: "chunkDone",
    reqId: msg.reqId,
    range: frames.range,
  });
}

async function decodeAndDispatch(
  reqId: number,
  frame: { frame_number: number; filepath?: string },
): Promise<void> {
  if (!frame.filepath || typeof frame.filepath !== "string") {
    return;
  }

  const src = resolveMediaSrc(frame.filepath);

  let bitmap: ImageBitmap;
  try {
    // CORS fetch (createImageBitmap needs a readable, non-opaque response).
    // `cache: "reload"` bypasses any opaque cache entry the same media URL may
    // already hold from an `<img>` load (e.g. the legacy ImaVid Explore looker
    // loads frames crossOrigin-less, caching an opaque response); reusing that
    // here would fail the CORS check with a missing Access-Control-Allow-Origin.
    const r = await fetch(src, { mode: "cors", cache: "reload" });

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
      error,
    );

    return;
  }

  postOutbound(
    {
      type: "frameReady",
      reqId,
      frameNumber: frame.frame_number,
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      // filepath: each ImaVid "frame" is its own image sample — the header
      // filename tracks the frame under the playhead.
      meta: { src, filepath: frame.filepath },
    },
    [bitmap],
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
    "/media",
  )}?filepath=${encodeURIComponent(filepath)}`;
}

function joinUrl(origin: string, pathPrefix: string, suffix: string): string {
  return `${origin}${pathPrefix}${suffix}`.replace(/([^:]\/)\/+/g, "$1");
}

function postOutbound(
  msg: FrameWorkerOutbound,
  transfer?: Transferable[],
): void {
  // self.postMessage's typing varies by lib; the cast is to the worker
  // DedicatedWorkerGlobalScope signature.
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    msg,
    transfer ?? [],
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
