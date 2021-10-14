/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { get32BitColor } from "./color";
import { CHUNK_SIZE, LABELS, LABEL_LISTS } from "./constants";
import { ARRAY_TYPES, deserialize } from "./numpy";
import { Coloring, FrameChunk, MaskTargets } from "./state";

interface ResolveColor {
  key: string | number;
  seed: number;
  color: string;
}

type ResolveColorMethod = ReaderMethod & ResolveColor;

const [requestColor, resolveColor] = ((): [
  (pool: string[], seed: number, key: string | number) => Promise<string>,
  (result: ResolveColor) => void
] => {
  const cache = {};
  const requests = {};
  const promises = {};

  return [
    (pool, seed, key) => {
      if (!(seed in cache)) {
        cache[seed] = {};
      }

      const colors = cache[seed];

      if (!(key in colors)) {
        if (!(seed in requests)) {
          requests[seed] = {};
          promises[seed] = {};
        }

        const seedRequests = requests[seed];
        const seedPromises = promises[seed];

        if (!(key in seedRequests)) {
          seedPromises[key] = new Promise((resolve) => {
            seedRequests[key] = resolve;
            postMessage({
              method: "requestColor",
              key,
              seed,
              pool,
            });
          });
        }

        return seedPromises[key];
      }

      return Promise.resolve(colors[key]);
    },
    ({ key, seed, color }) => {
      requests[seed][key](color);
    },
  ];
})();

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
  coloring: Coloring,
  prefix: string = ""
): Promise<ArrayBuffer[]> => {
  let buffers: ArrayBuffer[] = [];
  const promises = [];

  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }

    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](label, buffers);
    }

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

    if (UPDATE_LABEL[label._cls]) {
      promises.push(UPDATE_LABEL[label._cls](prefix + field, label, coloring));
    }
  }

  return Promise.all(promises).then(() => buffers);
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
  mapId(sample);

  let bufferPromises = [processLabels(sample, coloring)];

  if (sample.frames && sample.frames.length) {
    bufferPromises = [
      ...bufferPromises,
      ...sample.frames
        .map((frame) => processLabels(frame, coloring, "frames."))
        .flat(),
    ];
  }

  Promise.all(bufferPromises).then((buffers) => {
    postMessage(
      {
        method: "processSample",
        sample,
        uuid,
      },
      // @ts-ignore
      buffers.flat()
    );
  });
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
        if (frameNumber > frameCount || cancelled) {
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
    Promise.all(
      value.frames.map((frame) =>
        processLabels(frame, value.coloring, "frames.")
      )
    ).then((buffers) => {
      postMessage(
        {
          method: "frameChunk",
          frames: value.frames,
          range: value.range,
          uuid,
        },
        // @ts-ignore
        buffers.flat()
      );
    });
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

const isFloatArray = (arr) =>
  arr instanceof Float32Array || arr instanceof Float64Array;

const UPDATE_LABEL = {
  Detection: async (field, label, coloring: Coloring) => {
    if (!label.mask) {
      return;
    }

    const color = await requestColor(
      coloring.pool,
      coloring.seed,
      coloring.byLabel ? label.label : field
    );

    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const bitColor = get32BitColor(color);

    for (const i in overlay) {
      if (targets[i]) {
        overlay[i] = bitColor;
      }
    }
  },
  Detections: async (field, labels, coloring: Coloring) => {
    const promises = labels.detections.map((label) =>
      UPDATE_LABEL[label._cls](field, label, coloring)
    );

    await Promise.all(promises);
  },
  Heatmap: async (field, label, coloring: Coloring) => {
    if (!label.map) {
      return;
    }

    const overlay = new Uint32Array(label.map.image);
    const targets = new ARRAY_TYPES[label.map.data.arrayType](
      label.map.data.buffer
    );
    const [start, stop] = label.range
      ? label.range
      : isFloatArray(targets)
      ? [0, 1]
      : [0, 255];

    const max = Math.max(Math.abs(start), Math.abs(stop));

    const color = await requestColor(coloring.pool, coloring.seed, field);

    const getColor = coloring.byLabel
      ? (value) => {
          if (value === 0) {
            return 0;
          }

          const index = Math.round(
            (Math.max(value - start, 0) / (stop - start)) *
              (coloring.scale.length - 1)
          );

          return get32BitColor(coloring.scale[index]);
        }
      : (value) => {
          if (value === 0) {
            return 0;
          }

          return get32BitColor(color, Math.min(max, Math.abs(value)) / max);
        };

    for (const i in overlay) {
      if (targets[i] !== 0) {
        overlay[i] = getColor(targets[i]);
      }
    }
  },
  Segmentation: async (field, label, coloring) => {
    if (!label.mask) {
      return;
    }

    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    let maskTargets = coloring.maskTargets[field];

    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }
    const cache = {};

    let color;
    if (maskTargets && Object.keys(maskTargets).length === 1) {
      color = get32BitColor(
        await requestColor(coloring.pool, coloring.seed, field)
      );
    }

    const getColor = (i) => {
      i = Math.round(Math.abs(i)) % coloring.targets.length;

      if (i in cache) {
        return cache[i];
      }

      cache[i] = get32BitColor(coloring.targets[i]);
    };

    for (const i in overlay) {
      if (targets[i] !== 0) {
        overlay[i] = color ? color : getColor(targets[i]);
      }
    }
  },
};

type Method =
  | ProcessSampleMethod
  | RequestFrameChunkMethod
  | SetStreamMethod
  | ResolveColorMethod;

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
    case "resolveColor":
      resolveColor(args as ResolveColor);
      return;
    default:
      throw new Error("unknown method");
  }
};
