/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { get32BitColor, createColorGenerator } from "./color";
import { CHUNK_SIZE, LABELS, LABEL_LISTS } from "./constants";
import { ARRAY_TYPES, deserialize } from "./numpy";
import { BaseLabel, LabelUpdate } from "./overlays/base";
import { FrameChunk, RGB } from "./state";

const colorGenerators = {};

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
  Heatmap: (label, buffers) => {
    if (typeof label.map === "string") {
      label.map = deserialize(label.map);
      buffers.push(label.map.buffer);
    }
  },
  Segmentation: (label, buffers) => {
    if (typeof label.mask === "string") {
      label.mask = deserialize(label.mask);
      buffers.push(label.mask.buffer);
    }
  },
};

const mapId = (obj) => {
  obj.id = obj._id;
  delete obj._id;
  return obj;
};

const processLabels = (
  sample: { [key: string]: any },
  colorByLabel: boolean,
  colorPool: string[],
  colorSeed: number
): ArrayBuffer[] => {
  let buffers: ArrayBuffer[] = [];

  if (!(colorSeed in colorGenerators)) {
    colorGenerators[colorSeed] = createColorGenerator(colorPool, colorSeed);
  }

  const colorGenerator = colorGenerators[colorSeed];

  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](label, buffers);
    }

    UPDATE_LABEL[label._cls] &&
      UPDATE_LABEL[label._cls](
        label,
        colorByLabel && label.label && fieldColoring[field]
      );

    if (label._cls in LABELS) {
      if (label._cls in LABEL_LISTS) {
        const list = label[LABEL_LISTS[label._cls]];
        if (Array.isArray(list)) {
          label[LABEL_LISTS[label._cls]] = list.map(mapId);
        }
      } else {
        mapId(label);
      }
    }
  }

  return buffers;
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
  uuid: string;
  sample: {
    [key: string]: object;
    frames: any[];
  };
  colorByLabel: boolean;
  colorSeed: number;
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({
  sample,
  uuid,
  colorByLabel,
  colorSeed,
}: ProcessSample) => {
  let buffers = processLabels(sample, colorByLabel, colorSeed);

  if (sample.frames && sample.frames.length) {
    buffers = [
      ...buffers,
      ...sample.frames
        .map<ArrayBuffer[]>((frame) =>
          processLabels(frame, colorByLabel, colorSeed)
        )
        .flat(),
    ];
  }

  mapId(sample);
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
  reader: ReadableStreamDefaultReader<FrameChunkResponse>;
  cancel: () => void;
}

interface FrameChunkResponse extends FrameChunk {
  colorByLabel: boolean;
  colorSeed: number;
}

const createReader = ({
  chunkSize,
  colorByLabel,
  colorSeed,
  frameCount,
  frameNumber,
  sampleId,
  url,
}: {
  chunkSize: number;
  colorByLabel: boolean;
  colorSeed: number;
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  url: string;
}): FrameStream => {
  let cancelled = false;

  const privateStream = new ReadableStream<FrameChunkResponse>(
    {
      pull: (controller: ReadableStreamDefaultController) => {
        if (frameNumber >= frameCount || cancelled) {
          controller.close();
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
          fetch(
            `${url}/frames?` +
              new URLSearchParams({
                frameNumber: frameNumber.toString(),
                numFrames: chunkSize.toString(),
                frameCount: frameCount.toString(),
                sampleId,
              })
          )
            .then((response: Response) => response.json())
            .then(({ frames, range }: FrameChunk) => {
              controller.enqueue({ frames, range, colorByLabel, colorSeed });
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
  value?: FrameChunkResponse;
}) => {
  if (value) {
    let buffers: ArrayBuffer[] = [];

    value.frames.forEach((frame) => {
      buffers = [
        ...buffers,
        ...processLabels(frame, value.colorByLabel, value.colorSeed),
      ];
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

type RequestFrameChunkMethod = ReaderMethod & RequestFrameChunk;

const requestFrameChunk = ({ uuid }: RequestFrameChunk) => {
  if (uuid === streamId) {
    stream && stream.reader.read().then(getSendChunk(uuid));
  }
};

interface SetStream {
  fieldColoring: FieldColoring;
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  uuid: string;
  url: string;
}

type SetStreamMethod = ReaderMethod & SetStream;

const setStream = ({
  fieldColoring,
  frameCount,
  frameNumber,
  sampleId,
  uuid,
  url,
}: SetStream) => {
  stream && stream.cancel();
  streamId = uuid;
  stream = createReader({
    chunkSize: CHUNK_SIZE,
    fieldColoring,
    frameCount: frameCount,
    frameNumber: frameNumber,
    sampleId,
    url,
  });

  stream.reader.read().then(getSendChunk(uuid));
};

interface UpdateLabels {
  uuid: string;
  labels: LabelUpdate<BaseLabel>[][];
}

type UpdateLabelsMethod = ReaderMethod & UpdateLabels;

const UPDATE_LABEL = {
  Detection: (label, color) => {
    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    color = get32BitColor(color);

    for (const i in overlay) {
      if (targets[i]) {
        overlay[i] = color;
      }
    }
  },
  Heatmap: (label, coloring) => {
    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const [start, stop] = label.range;
    const max = Math.max(Math.abs(start), Math.abs(stop));

    const getColor = Array.isArray(coloring[0])
      ? (value) => {
          if (value === 0) {
            return 0;
          }

          const index = Math.round(
            (Math.max(value - start, 0) / (stop - start)) *
              (coloring.length - 1)
          );

          return get32BitColor(coloring[index]);
        }
      : (value) => {
          if (value === 0) {
            return 0;
          }

          return get32BitColor(coloring, Math.min(max, Math.abs(value)) / max);
        };

    for (const i in overlay) {
      if (targets[i] !== 0) {
        overlay[i] = getColor(targets[i]);
      }
    }
  },
  Segmentation: (label, coloring: RGB[]) => {
    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );

    const cache = {};

    const getColor = (i) => {
      i = Math.round(Math.abs(i)) % coloring.length;

      if (i in cache) {
        return cache[i];
      }

      cache[i] = get32BitColor(coloring[i]);
    };

    for (const i in overlay) {
      if (targets[i] !== 0) {
        overlay[i] = getColor(targets[i]);
      }
    }
  },
};

const updateLabels = ({ labels, uuid }: UpdateLabels) => {
  labels.forEach((l) =>
    l.forEach(({ label, coloring }) =>
      UPDATE_LABEL[label._cls](label, coloring)
    )
  );

  postMessage({
    method: "labelsUpdate",
    labels,
    uuid,
  });
};

type Method =
  | ProcessSampleMethod
  | RequestFrameChunkMethod
  | SetStreamMethod
  | UpdateLabelsMethod;

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
    case "updateLabels":
      updateLabels(args as UpdateLabels);
      return;
    default:
      throw new Error("unknown method");
  }
};
