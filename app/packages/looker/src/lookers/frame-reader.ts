import {
  type Schema,
  type Stage,
  sizeBytesEstimate,
} from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { v4 as uuid } from "uuid";
import type { Coloring, CustomizeColor } from "..";
import {
  CHUNK_SIZE,
  MAX_FRAME_STREAM_SIZE,
  MAX_FRAME_STREAM_SIZE_BYTES,
} from "../constants";
import { loadOverlays } from "../overlays";
import type { Overlay } from "../overlays/base";
import type {
  BaseConfig,
  BufferRange,
  FrameChunkResponse,
  FrameSample,
  StateUpdate,
  VideoState,
} from "../state";
import { createWorker } from "../util";
import { LookerUtils, withFrames } from "./shared";

export interface Frame {
  sample: FrameSample;
  overlays: Overlay<VideoState>[];
}

// Bound the number of per-sample frame caches kept alive. Each inner cache is
// LRU-bounded, but an unbounded outer map grew one ~1GB cache per video sample ever
// hovered/scrolled and never freed it → renderer OOM on large video grids.
const MAX_FRAME_STORES = 20;

// FRAME-LEVEL CACHE: native-video frames keyed by `(sampleId -> frameNumber -> Frame)`,
// module-level + LRU-bounded, persistent across looker detach (mirrors imavid's
// shared sample cache). Grid hover fills it; opening the modal reuses it so playback
// resumes instantly — only missing ranges stream. Reset only on view/filter change.
const frameStores = new LRUCache<string, LRUCache<number, Frame>>({
  max: MAX_FRAME_STORES,
  dispose: (store) => store.clear(),
});

const getFrameStore = (sampleId: string): LRUCache<number, Frame> => {
  let store = frameStores.get(sampleId);
  if (!store) {
    store = new LRUCache<number, Frame>({
      dispose: (frame) => {
        for (let i = 0; i < frame.overlays.length; i++) {
          frame.overlays[i].cleanup?.();
        }
      },
      max: MAX_FRAME_STREAM_SIZE,
      maxSize: MAX_FRAME_STREAM_SIZE_BYTES,
      noDisposeOnSet: true,
      sizeCalculation: (frame) => sizeBytesEstimate(frame.overlays),
    });
    frameStores.set(sampleId, store);
  }
  return store;
};

// Reset on view/filter change ONLY (called from the looker package boundary); detach
// must NEVER reach this — that was the native-video single-reader wipe bug.
export const resetFrameStores = () => {
  for (const store of frameStores.values()) {
    store.clear();
  }
  frameStores.clear();
};

interface AcquireReaderOptions {
  activePaths: string[];
  addFrame: (frameNumber: number, frame: Frame) => void;
  addFrameBuffers: (range: [number, number]) => void;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  dispatchEvent: (eventType: "buffering", detail: boolean) => void;
  getCurrentFrame: () => number;
  dataset: string;
  frameNumber: number;
  frameCount: number;
  group: BaseConfig["group"];
  sampleId: string;
  schema: Schema;
  update: StateUpdate<VideoState>;
  view: Stage[];
}

export const { acquireReader, clearReader } = (() => {
  let currentOptions: AcquireReaderOptions = null;
  // the per-sample store the ACTIVE reader streams into — resolved from the
  // persistent module-level map, never recreated on detach.
  let frameCache: LRUCache<number, Frame> = null;
  let frameReader: Worker;
  let nextRange: BufferRange = null;
  let requestingFrames = false;

  const setStream = ({
    addFrame,
    addFrameBuffers,
    frameNumber,
    frameCount,
    sampleId,
    update,
    dispatchEvent,
    coloring,
    customizeColorSetting,
    dataset,
    view,
    group,
    schema,
    activePaths,
  }: AcquireReaderOptions): string => {
    nextRange = [frameNumber, Math.min(frameCount, CHUNK_SIZE + frameNumber)];
    const subscription = uuid();

    frameReader?.terminate();
    frameReader = createWorker({
      ...LookerUtils.workerCallbacks,
      frameChunk: [
        (worker, { frames, range: [start, end] }: FrameChunkResponse) => {
          addFrameBuffers([start, end]);
          for (let i = 0; i < frames.length; i++) {
            const frameSample = frames[i];
            const prefixedFrameSample = withFrames(frameSample);
            const overlays = loadOverlays(prefixedFrameSample, schema);
            const frame = { overlays, sample: frameSample };
            // write to the persistent per-sample store so a re-acquired looker
            // (modal) reuses these frames without re-streaming
            frameCache.set(frameSample.frame_number, frame);
            addFrame(frameSample.frame_number, frame);
          }

          if (end < frameCount) {
            nextRange = [end + 1, Math.min(frameCount, end + 1 + CHUNK_SIZE)];
            requestingFrames = true;
            worker.postMessage({
              method: "requestFrameChunk",
              uuid: subscription,
            });
          } else {
            requestingFrames = false;
            nextRange = null;
          }

          update((state) => {
            state.buffering && dispatchEvent("buffering", false);
            return { buffering: false };
          });
        },
      ],
    });

    requestingFrames = true;
    frameReader.postMessage({
      method: "setStream",
      activePaths,
      sampleId,
      frameCount,
      frameNumber,
      uuid: subscription,
      coloring,
      customizeColorSetting,
      dataset,
      view,
      group,
      schema,
    });
    return subscription;
  };

  return {
    acquireReader: (
      options: AcquireReaderOptions
    ): ((frameNumber?: number) => void) => {
      currentOptions = options;
      frameCache = getFrameStore(options.sampleId);

      // Replay frames already cached by a prior looker (grid hover) into THIS
      // looker so the modal resumes instantly; only gaps stream below.
      frameCache.forEach((frame, frameNumber) => {
        options.addFrame(frameNumber, frame);
        options.addFrameBuffers([frameNumber, frameNumber]);
      });

      // Only open a worker stream if the starting frame isn't already cached — a
      // re-acquired looker (modal) over a fully-buffered video issues ZERO refetch;
      // the request callback below restarts the stream on the first real cache miss.
      let subscription: string | null = null;
      if (!frameCache.has(options.frameNumber)) {
        subscription = setStream(currentOptions);
      } else {
        nextRange = null;
        requestingFrames = false;
      }

      return (frameNumber: number) => {
        const isCacheMiss = Boolean(frameCache && !frameCache.has(frameNumber));
        // a frame already in the persistent cache needs no fetch — never re-stream it.
        if (!isCacheMiss) {
          return;
        }
        const isBeingFetched =
          nextRange !== null &&
          frameNumber >= nextRange[0] &&
          frameNumber <= nextRange[1];

        if (!nextRange || !isBeingFetched) {
          subscription = setStream({ ...currentOptions, frameNumber });
        } else if (!requestingFrames && subscription) {
          frameReader.postMessage({
            method: "requestFrameChunk",
            uuid: subscription,
          });
        }
        requestingFrames = true;
      };
    },

    // Stop the active worker + reset streaming state, but KEEP the per-sample frame
    // caches (they live in `frameStores`) — this is the native-video reuse fix.
    clearReader: () => {
      nextRange = null;
      frameCache = null;
      currentOptions = null;
      requestingFrames = false;
      frameReader?.terminate();
      frameReader = undefined;
    },
  };
})();
