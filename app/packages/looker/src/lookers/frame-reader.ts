import type { Schema, Stage } from "@fiftyone/utilities";
import { LRUCache } from "lru-cache";
import { v4 as uuid } from "uuid";
import type { Coloring, CustomizeColor } from "..";
import { CHUNK_SIZE } from "../constants";
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
  maxFrameStreamSize?: number;
  removeFrame: RemoveFrame;
  sampleId: string;
  schema: Schema;
  update: StateUpdate<VideoState>;
  view: Stage[];
}

export const { acquireReader, clearReader } = (() => {
  const createCache = (
    removeFrame: RemoveFrame,
    maxFrameStreamSize?: number
  ) => {
    console.log(maxFrameStreamSize);
    return new LRUCache<number, Frame>({
      max: maxFrameStreamSize || 1000,
      dispose: (_, key) => {
        removeFrame(key);
      },
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
      frameCache = createCache(options.removeFrame, options.maxFrameStreamSize);

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
