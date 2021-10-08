/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { get32BitColor, getColor } from "./color";
import { CHUNK_SIZE, LABELS, LABEL_LISTS } from "./constants";
import { ARRAY_TYPES, deserialize } from "./numpy";
import { BaseLabel, LabelUpdate } from "./overlays/base";
import { Coloring, FrameChunk } from "./state";

const DESERIALIZE = {
  Detection: (label, buffers) => {
    if (typeof label.mask === "string") {
      const data = deserialize(label.mask);
      const [height, width] = data.shape;

      label.mask = {
        data,
        image: new ImageData(width, height).data.buffer,
      };
      buffers.push(data.buffer);
      buffers.push(label.mask.image);
    }
  },
  Detections: (labels, buffers) => {
    labels.detections.forEach((label) =>
      DESERIALIZE[label._cls](label, buffers)
    );
  },
  Heatmap: (label, buffers) => {
    if (typeof label.map === "string") {
      const data = deserialize(label.map);
      const [height, width] = data.shape;

      label.map = {
        data,
        image: new ImageData(width, height).data.buffer,
      };

      buffers.push(data.buffer);
      buffers.push(label.map.image);
    }
  },
  Segmentation: (label, buffers) => {
    if (typeof label.mask === "string") {
      const data = deserialize(label.mask);
      const [height, width] = data.shape;

      label.mask = {
        data,
        image: new ImageData(width, height).data.buffer,
      };

      buffers.push(data.buffer);
      buffers.push(label.mask.image);
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
  coloring: Coloring
): ArrayBuffer[] => {
  let buffers: ArrayBuffer[] = [];

  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }

    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](label, buffers);
    }

    UPDATE_LABEL[label._cls] &&
      UPDATE_LABEL[label._cls](field, label, coloring);

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
  coloring: Coloring;
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({ sample, uuid, coloring }: ProcessSample) => {
  let buffers = processLabels(sample, coloring);

  if (sample.frames && sample.frames.length) {
    buffers = [
      ...buffers,
      ...sample.frames
        .map<ArrayBuffer[]>((frame) => processLabels(frame, coloring))
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
  coloring: Coloring;
}

const createReader = ({
  chunkSize,
  coloring,
  frameCount,
  frameNumber,
  sampleId,
  url,
}: {
  chunkSize: number;
  coloring: Coloring;
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
              controller.enqueue({ frames, range, coloring });
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
      buffers = [...buffers, ...processLabels(frame, value.coloring)];
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
  coloring: Coloring;
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  uuid: string;
  url: string;
}

type SetStreamMethod = ReaderMethod & SetStream;

const setStream = ({
  coloring,
  frameCount,
  frameNumber,
  sampleId,
  uuid,
  url,
}: SetStream) => {
  stream && stream.cancel();
  streamId = uuid;
  stream = createReader({
    coloring,
    chunkSize: CHUNK_SIZE,
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
  coloring: Coloring;
}

type UpdateLabelsMethod = ReaderMethod & UpdateLabels;

const UPDATE_LABEL = {
  Detection: (field, label, coloring: Coloring) => {
    if (!label.mask) {
      return;
    }

    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const color = get32BitColor(
      getColor(
        coloring.pool,
        coloring.seed,
        coloring.byLabel ? label.label : field
      )
    );

    for (const i in overlay) {
      if (targets[i]) {
        overlay[i] = color;
      }
    }
  },
  Detections: (field, labels, coloring: Coloring) =>
    labels.detections.forEach((label) =>
      UPDATE_LABEL[label._cls](field, label, coloring)
    ),
  Heatmap: (field, label, coloring: Coloring) => {
    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const [start, stop] = label.range;
    const max = Math.max(Math.abs(start), Math.abs(stop));

    const getColor = Array.isArray(coloring.byLabel)
      ? (value) => {
          if (value === 0) {
            return 0;
          }

          const index = Math.round(
            (Math.max(value - start, 0) / (stop - start)) *
              (coloring.scale.length - 1)
          );

          return get32BitColor(coloring[index]);
        }
      : (value) => {
          if (value === 0) {
            return 0;
          }

          return get32BitColor(
            getColor(coloring.pool, coloring.seed, field),
            Math.min(max, Math.abs(value)) / max
          );
        };

    for (const i in overlay) {
      if (targets[i] !== 0) {
        overlay[i] = getColor(targets[i]);
      }
    }
  },
  Segmentation: (field, label, coloring) => {
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

const updateLabels = ({ labels, coloring, uuid }: UpdateLabels) => {
  labels.forEach((l) =>
    l.forEach(({ label, field }) =>
      UPDATE_LABEL[label._cls](field, label, coloring)
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
