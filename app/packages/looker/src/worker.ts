/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { processMasks } from "./overlays";

const HIGH_WATER_MARK = 6;
const CHUNK_SIZE = 30;

interface FrameReader {
  chunkSize: number;
  frameNumber: number;
  sampleId: string;
  stream: ReadableStream<FrameChunk>;
}

interface FrameChunk {
  frames: any[];
  buffers: ArrayBuffer[];
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
    stream: new ReadableStream<FrameChunk>(
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
                let buffers = [];
                data.frames.forEach((frame) => {
                  buffers = [...buffers, processMasks(frame)];
                });
                controller.enqueue({ frames: data.frames, buffers });
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

let reader: FrameReader = null;
interface Frames {
  [key: number]: any;
}

interface FramesResult {
  frames: any[];
  end: number;
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
  uuid: string;
}

type SetReaderMethod = ReaderMethod & SetReader;

const setReader = ({
  origin,
  sampleId,
  frameNumber,
  frameCount,
  force,
}: SetReader) => {
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
  const sendChunk = ({
    done,
    value,
  }: {
    done: boolean;
    value?: FrameChunk;
  }) => {
    if (value) {
      postMessage(
        {
          method: "frameChunk",
          frames: value.frames,
        },
        buffers
      );
    }
    !done && stream.read().then(sendChunk);
  };

  stream.read().then(sendChunk);
};

interface ProcessSample {
  origin: string;
  uuid: string;
  sample: {
    [key: string]: object;
    frames?: {
      1: object;
    };
  };
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({ sample, uuid }: ProcessSample) => {
  let buffers = processMasks(sample);

  if (sample.frames && sample.frames[1]) {
    buffers = [...buffers, ...processMasks(sample.frames[1])];
  }

  postMessage(
    {
      method: "processSample",
      sample,
      uuid,
    },
    // @ts-ignore
    buffers
  );
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
