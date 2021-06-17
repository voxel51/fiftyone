/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { CHUNK_SIZE } from "./constants";
import { processMasks } from "./overlays";
import { FrameChunk, FrameSample } from "./state";

const getUrl = (origin: string): string => {
  if (import.meta.env.NODE_ENV === "development") {
    origin = "http://localhost:5151";
  }
  return `${origin}/frames?`;
};

/** GLOBALS */

const HIGH_WATER_MARK = 6;

let stream: FrameStream = null;
let streamId: string = null;

/** END GLOBALS */

interface ReaderMethod {
  method: string;
}

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

interface FrameStream {
  chunkSize: number;
  frameNumber: number;
  sampleId: string;
  reader: ReadableStreamDefaultReader<FrameChunk>;
  cancel: () => void;
}

const createReader = ({
  chunkSize,
  frameCount,
  frameNumber,
  origin,
  sampleId,
}: {
  chunkSize: number;
  frameCount: number;
  frameNumber: number;
  origin: string;
  sampleId: string;
}): FrameStream => {
  let cancelled = false;

  const privateStream = new ReadableStream<FrameChunk>(
    {
      pull: (controller: ReadableStreamDefaultController) => {
        if (frameNumber >= frameCount || cancelled) {
          controller.close();
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
          fetch(
            getUrl(origin) +
              new URLSearchParams({
                frameNumber: frameNumber.toString(),
                numFrames: chunkSize.toString(),
                frameCount: frameCount.toString(),
                sampleId,
              })
          )
            .then((response: Response) => response.json())
            .then(({ frames, range }: FrameChunk) => {
              controller.enqueue({ frames, range });
              frameNumber = range[1];
              resolve();
            })
            .catch((error) => {
              reject(error);
            });
        });
      },
      cancel: () => {
        cancelled = true;
      },
    },
    new CountQueuingStrategy({ highWaterMark: HIGH_WATER_MARK })
  );
  return {
    sampleId,
    frameNumber,
    chunkSize,
    reader: privateStream.getReader(),
    cancel: () => (cancelled = true),
  };
};

const getSendChunk = (uuid: string) => ({
  value,
}: {
  done: boolean;
  value?: FrameChunk;
}) => {
  if (value) {
    let buffers: ArrayBuffer[] = [];
    const frames = value.frames.map<FrameSample>((frame) => {
      return Object.fromEntries(
        Object.entries(frame).map(([k, v]) => ["frames." + k, v])
      ) as FrameSample;
    });
    console.log("sending chunk", value.range);

    frames.forEach((frame) => {
      buffers = [...buffers, ...processMasks(frame)];
    });
    postMessage(
      {
        method: "frameChunk",
        frames,
        range: value.range,
        uuid,
      },
      // @ts-ignore
      buffers
    );
  }
};

interface RequestFrameChunk {
  uuid: string;
}

const requestFrameChunk = ({ uuid }) => {
  if (uuid === streamId) {
    stream.reader.read().then(getSendChunk(uuid));
  }
};

interface SetStream {
  origin: string;
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  uuid: string;
}

type SetStreamMethod = ReaderMethod & SetStream;

const setStream = ({
  origin,
  sampleId,
  frameNumber,
  frameCount,
  uuid,
}: SetStream) => {
  if (stream) {
    stream.cancel();
  }
  streamId = uuid;
  stream = createReader({
    chunkSize: CHUNK_SIZE,
    frameCount: frameCount,
    frameNumber: frameNumber,
    sampleId,
    origin,
  });

  stream.reader.read().then(getSendChunk(uuid));
};

type Method = SetStreamMethod | ProcessSampleMethod;

onmessage = ({ data: { method, ...args } }: MessageEvent<Method>) => {
  switch (method) {
    case "processSample":
      processSample(args as ProcessSample);
      return;
    case "requestFrameChunk":
      requestFrameChunk(args as RequestFrameChunk);
      return;
    case "setStream":
      setStream(args as SetStream);
      return;
    default:
      throw new Error("unknown method");
  }
};
