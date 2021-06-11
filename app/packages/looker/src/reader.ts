/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

const HIGH_WATER_MARK = 3;

let stream: ReadableStream = null;

const createStream = ({
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
}) => {
  let cancelled = false;
  return new ReadableStream(
    {
      pull: (controller: ReadableStreamDefaultController) => {
        if (frameNumber >= frameCount) {
          controller.close();
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
              console.log(data);
              controller.enqueue({ hello: "world" });
              frameNumber = nextFrameChunkStart;
              resolve();
            });
        });
      },
      cancel: (reason) => {
        cancelled = true;
      },
    },
    new CountQueuingStrategy({ highWaterMark: 3 })
  );
};

let currentOrigin: string = null;
let current;

interface Frames {
  [key: number]: any;
}

type FrameRange = [number, number];

interface FramesResult {
  frames: Frames;
  range: FrameRange;
}

const setReader = (args: {
  origin: string;
  sampleId: string;
  frameNumber: number;
  numFrames: number;
  force: boolean;
}) => {};

const send = () => {
  postMessage({}, currentOrigin);
};

onmessage = (message: MessageEvent) => setReader(message.data);
