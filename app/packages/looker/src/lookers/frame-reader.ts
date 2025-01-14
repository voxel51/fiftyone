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

type RemoveFrame = (frameNumber: number) => void;

export interface Frame {
  sample: FrameSample;
  overlays: Overlay<VideoState>[];
}

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
  removeFrame: RemoveFrame;
  sampleId: string;
  schema: Schema;
  update: StateUpdate<VideoState>;
  view: Stage[];
}

export const { acquireReader, clearReader } = (() => {
  const createCache = (removeFrame: RemoveFrame) => {
    return new LRUCache<number, Frame>({
      dispose: (frame, key) => {
        const overlays = frame.overlays;

        for (let i = 0; i < overlays.length; i++) {
          overlays[i].cleanup?.();
        }

        removeFrame(key);
      },
      max: MAX_FRAME_STREAM_SIZE,
      maxSize: MAX_FRAME_STREAM_SIZE_BYTES,
      noDisposeOnSet: true,
      sizeCalculation: (frame) => sizeBytesEstimate(frame.overlays),
    });
  };

  let currentOptions: AcquireReaderOptions = null;
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

      let subscription = setStream(currentOptions);
      frameCache = createCache(options.removeFrame);

      return (frameNumber: number) => {
        if (!nextRange) {
          nextRange = [frameNumber, frameNumber + CHUNK_SIZE];
          subscription = setStream({ ...currentOptions, frameNumber });
        } else if (!requestingFrames) {
          frameReader.postMessage({
            method: "requestFrameChunk",
            uuid: subscription,
          });
        }
        requestingFrames = true;
      };
    },

    clearReader: () => {
      nextRange = null;
      frameCache = null;
      currentOptions = null;
      frameReader?.terminate();
      frameReader = undefined;
    },
  };
})();
