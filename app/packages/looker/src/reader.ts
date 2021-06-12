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

const setReader = ({
  origin,
  sampleId,
  frameNumber,
  frameCount,
  force,
}: {
  origin: string;
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  force: boolean;
}) => {
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

onmessage = (message: MessageEvent) => setReader(message.data);
