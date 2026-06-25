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
  FIRST_CHUNK_SIZE,
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

// bound the per-sample frame caches kept alive; an unbounded outer map leaked one
// large cache per video sample ever hovered, OOMing the renderer on big grids
const MAX_FRAME_STORES = 20;

// native-video frames keyed by sampleId -> frameNumber -> Frame, persistent across
// looker detach so the modal reuses grid-hover frames; reset only on view/filter change
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

// reset on view/filter change only; detach must not reach this
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
  // the per-sample store the active reader streams into, resolved from the
  // persistent module-level map
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
    nextRange = [
      frameNumber,
      Math.min(frameCount, FIRST_CHUNK_SIZE + frameNumber),
    ];
    const subscription = uuid();

    frameReader?.terminate();
    frameReader = createWorker({
      ...LookerUtils.workerCallbacks,
      frameChunk: [
        (worker, { frames, range: [start, end] }: FrameChunkResponse) => {
          addFrameBuffers([start, end]);

          // kick the next chunk before rasterizing this one so the network stays
          // busy while the main thread builds overlays (they no longer serialize)
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

          for (let i = 0; i < frames.length; i++) {
            const frameSample = frames[i];
            const prefixedFrameSample = withFrames(frameSample);
            const overlays = loadOverlays(prefixedFrameSample, schema);
            const frame = { overlays, sample: frameSample };
            frameCache.set(frameSample.frame_number, frame);
            addFrame(frameSample.frame_number, frame);
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

      // replay frames cached by a prior looker (grid hover) into this looker; gaps stream below
      frameCache.forEach((frame, frameNumber) => {
        options.addFrame(frameNumber, frame);
        options.addFrameBuffers([frameNumber, frameNumber]);
      });

      // only open a stream if the starting frame isn't already cached
      let subscription: string | null = null;
      if (!frameCache.has(options.frameNumber)) {
        subscription = setStream(currentOptions);
      } else {
        nextRange = null;
        requestingFrames = false;
      }

      return (frameNumber: number) => {
        const isCacheMiss = Boolean(frameCache && !frameCache.has(frameNumber));
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

    // stop the active worker + reset streaming state, but keep the per-sample
    // frame caches in `frameStores` so a re-acquired looker reuses them
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
