/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { CHUNK_SIZE } from "./constants";
import { deserialize } from "./numpy";
import { FrameChunk } from "./state";

const DESERIALIZE = {
  Detection: (label, buffers) => {
    if (typeof label.mask === "string") {
      label.mask = deserialize(label.mask);
      buffers.push(label.mask.buffer);
    }
  },
  Detections: (labels, buffers) => {
    labels.detections.forEach((label) => {
      if (typeof label.mask === "string") {
        label.mask = deserialize(label.mask);
        buffers.push(label.mask.buffer);
      }
    });
  },
  Segmentation: (label, buffers) => {
    if (typeof label.mask === "string") {
      label.mask = deserialize(label.mask);
      buffers.push(label.mask.buffer);
    }
  },
};

const processMasks = (sample: { [key: string]: any }): ArrayBuffer[] => {
  let buffers: ArrayBuffer[] = [];
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](label, buffers);
    }
  }

  return buffers;
};

const getUrl = (origin: string): string => {
  // @ts-ignore
  if (import.meta.env.DEV) {
    origin = "http://localhost:5151";
  }
  return `${origin}/frames?`;
};

/** GLOBALS */

const HIGH_WATER_MARK = 6;

let stream: FrameStream | null = null;
let streamId: string | null = null;

/** END GLOBALS */

interface ReaderMethod {
  method: string;
}

interface ProcessSample {
  origin: string;
  uuid: string;
  sample: {
    [key: string]: object;
    frames: any[];
  };
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({ sample, uuid }: ProcessSample) => {
  let buffers = processMasks(sample);

  if (sample.frames && sample.frames.length) {
    buffers = [
      ...buffers,
      ...sample.frames
        .map<ArrayBuffer[]>((frame) => processMasks(frame))
        .flat(),
    ];
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
              frameNumber = range[1] + 1;
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

    value.frames.forEach((frame) => {
      buffers = [...buffers, ...processMasks(frame)];
    });
    postMessage(
      {
        method: "frameChunk",
        frames: value.frames,
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

const requestFrameChunk = ({ uuid }: RequestFrameChunk) => {
  if (uuid === streamId) {
    stream && stream.reader.read().then(getSendChunk(uuid));
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
