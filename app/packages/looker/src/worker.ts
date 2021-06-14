/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { processMasks } from "./overlays";

const HIGH_WATER_MARK = 120;
const CHUNK_SIZE = 30;

interface FrameReader {
  chunkSize: number;
  frameNumber: number;
  sampleId: string;
  stream: ReadableStream;
}

const createReader = ({
  chunkSize,
  frameCount,
  frameNumber,
  url,
  sampleId,
}: {
  chunkSize: number;
  frameCount: number;
  frameNumber: number;
  url: string;
  sampleId: string;
}): FrameReader => {
  let cancelled = false;
  return {
    sampleId,
    frameNumber,
    chunkSize,
    stream: new ReadableStream(
      {
        pull: (controller: ReadableStreamDefaultController) => {
          if (frameNumber >= frameCount) {
            controller.close();
            return Promise.resolve();
          }

          let nextFrameChunkStart = frameNumber + chunkSize;
          return new Promise((resolve, reject) => {
            fetch(
              url +
                new URLSearchParams({
                  frameNumber: frameNumber.toString(),
                  numFrames: chunkSize.toString(),
                  sampleId,
                })
            )
              .then((response: Response) => response.json())
              .then((data) => {
                data.frames.array.forEach((frame) => {
                  processMasks(frame);
                  controller.enqueue(frame);
                });
                frameNumber = nextFrameChunkStart;
                resolve();
              })
              .catch((error) => {
                reject(error);
              });
          });
        },
        cancel: (reason) => {
          cancelled = true;
        },
      },
      new CountQueuingStrategy({ highWaterMark: HIGH_WATER_MARK })
    ),
  };
};

let currentOrigin: string = null;
let reader: FrameReader = null;
interface Frames {
  [key: number]: any;
}

type FrameRange = [number, number];

interface FramesResult {
  frames: Frames;
  range: FrameRange;
}

interface ReaderMethod {
  method: string;
}

interface SetReader {
  origin: string;
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  force?: boolean;
}

type SetReaderMethod = ReaderMethod & SetReader;

const setReader = ({
  origin,
  sampleId,
  frameNumber,
  frameCount,
  force,
}: SetReader) => {
  currentOrigin = origin;
  if (!reader || force || reader.sampleId !== sampleId) {
    reader.stream && reader.stream.cancel();
    reader = createReader({
      chunkSize: CHUNK_SIZE,
      frameCount: frameCount,
      frameNumber: frameNumber,
      sampleId,
      url: `${origin}/frames`,
    });
  }

  const stream = reader.stream.getReader();
  while (!stream.closed) {}
};

interface ProcessSample {
  origin: string;
  sample: {
    [key: string]: object;
    frames?: {
      1: object;
    };
  };
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({ sample }: ProcessSample) => {
  processMasks(sample);
  sample.frames && sample.frames[1] && processMasks(sample.frames[1]);

  postMessage({
    method: "processSample",
    sample,
  });
};

type Method = SetReaderMethod | ProcessSampleMethod;

onmessage = ({ data: { method, ...args } }: MessageEvent<Method>) => {
  switch (method) {
    case "setReader":
      setReader(args as SetReader);
      return;
    case "processSample":
      processSample(args as ProcessSample);
      return;
    default:
      throw new Error("unknown method");
  }
};
