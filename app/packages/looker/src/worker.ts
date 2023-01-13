/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import {
  DENSE_LABELS,
  DETECTIONS,
  get32BitColor,
  getFetchFunction,
  HEATMAP,
  LABEL_LIST,
  rgbToHexCached,
  setFetchFunction,
  Stage,
  VALID_LABEL_TYPES,
} from "@fiftyone/utilities";
import { decode as decodePng } from "fast-png";
import { CHUNK_SIZE } from "./constants";
import { ARRAY_TYPES, deserialize, OverlayMask, TypedArray } from "./numpy";
import { isRgbMaskTargets } from "./overlays/util";
import { Coloring, FrameChunk, MaskTargets, RgbMaskTargets } from "./state";

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
        image: new ArrayBuffer(width * height * 4),
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
        image: new ArrayBuffer(width * height * 4),
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
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      buffers.push(label.mask.image);
    }
  },
};

const mapId = (obj) => {
  if (obj && obj._id !== undefined) {
    obj.id = obj._id;
    delete obj._id;
  }
  return obj;
};

const ALL_VALID_LABELS = new Set(VALID_LABEL_TYPES);

/**
 * Some label types (example: segmentation, heatmap) can have their overlay data stored on-disk,
 * we want to impute the relevant mask property of these labels from what's stored in the disk
 */
const imputeOverlayFromPath = async (
  field: string,
  label: Record<string, any>,
  coloring: Coloring,
  buffers: ArrayBuffer[]
) => {
  // handle all list types here
  if (label._cls === DETECTIONS) {
    label.detections.forEach((detection) =>
      imputeOverlayFromPath(field, detection, coloring, buffers)
    );
    return;
  }

  // overlay path is in `map_path` property for heatmap, or else, it's in `mask_path` property (for segmentation or detection)
  const overlayPathField = label._cls === HEATMAP ? "map_path" : "mask_path";
  const overlayField = overlayPathField === "map_path" ? "map" : "mask";

  if (
    Object.hasOwn(label, overlayField) ||
    !Object.hasOwn(label, overlayPathField)
  ) {
    // nothing to be done
    return;
  }

  // convert absolute file path to a URL that we can "fetch" from
  const overlayPngImageUrl = getSampleSrc(label[overlayPathField] as string);

  const pngArrayBuffer: ArrayBuffer = await getFetchFunction()(
    "GET",
    overlayPngImageUrl,
    null,
    "arrayBuffer"
  );

  const overlayData = decodePng(pngArrayBuffer);

  const width = overlayData.width;
  const height = overlayData.height;

  const overlayMask: OverlayMask = {
    buffer: overlayData.data.buffer,
    channels: overlayData.channels,
    arrayType: overlayData.data.constructor.name as OverlayMask["arrayType"],
    shape: [height, width],
  };

  // set the `mask` property for this label
  label[overlayField] = {
    data: overlayMask,
    image: new ArrayBuffer(width * height * 4),
  };

  // transfer buffers
  buffers.push(overlayMask.buffer);
  buffers.push(label[overlayField].image);
};

const processLabels = async (
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

    if (DENSE_LABELS.has(label._cls)) {
      await imputeOverlayFromPath(field, label, coloring, buffers);
    }

    if (label._cls in DESERIALIZE) {
      DESERIALIZE[label._cls](label, buffers);
    }

    if (ALL_VALID_LABELS.has(label._cls)) {
      if (label._cls in LABEL_LIST) {
        const list = label[LABEL_LIST[label._cls]];
        if (Array.isArray(list)) {
          label[LABEL_LIST[label._cls]] = list.map(mapId);
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
        coloring,
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
  dataset,
  view,
}: {
  chunkSize: number;
  coloring: Coloring;
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  dataset: string;
  view: Stage[];
}): FrameStream => {
  let cancelled = false;

  const privateStream = new ReadableStream<FrameChunkResponse>(
    {
      pull: async (controller: ReadableStreamDefaultController) => {
        if (!frameCount || frameNumber > frameCount || cancelled) {
          controller.close();
          return Promise.resolve();
        }

        const call = (): Promise<FrameChunk> =>
          getFetchFunction()(
            "POST",
            "/frames",
            {
              frameNumber: frameNumber,
              numFrames: chunkSize,
              frameCount: frameCount,
              sampleId,
              dataset,
              view,
            },
            "json",
            2
          );

        return await (async () => {
          try {
            const { frames, range } = await call();

            controller.enqueue({ frames, range, coloring });
            frameNumber = range[1] + 1;
          } catch (error) {
            postMessage({
              error: {
                cls: error.constructor.name,
                data: error.data,
                message: error.message,
              },
            });
          }
        })();
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

const getSendChunk =
  (uuid: string) =>
  ({ value }: { done: boolean; value?: FrameChunkResponse }) => {
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
  dataset: string;
  view: Stage[];
}

type SetStreamMethod = ReaderMethod & SetStream;

const setStream = ({
  coloring,
  frameCount,
  frameNumber,
  sampleId,
  uuid,
  dataset,
  view,
}: SetStream) => {
  stream && stream.cancel();
  streamId = uuid;
  stream = createReader({
    coloring,
    chunkSize: CHUNK_SIZE,
    frameCount: frameCount,
    frameNumber: frameNumber,
    sampleId,
    dataset,
    view,
  });

  stream.reader.read().then(getSendChunk(uuid));
};

const isFloatArray = (arr) =>
  arr instanceof Float32Array || arr instanceof Float64Array;

const getRgbFromMaskData = (
  maskTypedArray: TypedArray,
  channels: number,
  index: number
) => {
  const r = maskTypedArray[index * channels];
  const g = maskTypedArray[index * channels + 1];
  const b = maskTypedArray[index * channels + 2];

  return [r, g, b] as [number, number, number];
};

const UPDATE_LABEL = {
  Detection: async (field, label, coloring: Coloring) => {
    if (!label.mask) {
      return;
    }

    const color = await requestColor(
      coloring.pool,
      coloring.seed,
      coloring.by === "label"
        ? label.label
        : coloring.by === "field"
        ? field
        : label.id
    );

    const overlay = new Uint32Array(label.mask.image);
    const targets = new ARRAY_TYPES[label.mask.data.arrayType](
      label.mask.data.buffer
    );
    const bitColor = get32BitColor(color);

    // these for loops must be fast. no "in" or "of" syntax
    for (let i = 0; i < overlay.length; i++) {
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

    const mapData = label.map.data;

    const targets = new ARRAY_TYPES[label.map.data.arrayType](
      label.map.data.buffer
    );

    if (mapData.channels > 2) {
      // rgb map
      for (let i = 0; i < overlay.length; i++) {
        overlay[i] = get32BitColor(
          getRgbFromMaskData(targets, mapData.channels, i)
        );
      }
    } else {
      const [start, stop] = label.range
        ? label.range
        : isFloatArray(targets)
        ? [0, 1]
        : [0, 255];
      const max = Math.max(Math.abs(start), Math.abs(stop));

      const color = await requestColor(coloring.pool, coloring.seed, field);

      const getColor =
        coloring.by === "label"
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
      // these for loops must be fast. no "in" or "of" syntax
      for (let i = 0; i < overlay.length; i++) {
        if (targets[i] !== 0) {
          overlay[i] = getColor(targets[i]);
        }
      }
    }
  },
  Segmentation: async (field, label, coloring) => {
    if (!label.mask) {
      return;
    }

    // the actual overlay that'll be painted, byte-length of width * height * 4 (RGBA channels)
    const overlay = new Uint32Array(label.mask.image);

    // each field may have its own target map
    let maskTargets: MaskTargets = coloring.maskTargets[field];

    // or, in the absence of field specific targets, use default mask targets that are dataset scoped
    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }

    const maskData: OverlayMask = label.mask.data;

    // target map array
    const targets = new ARRAY_TYPES[maskData.arrayType](maskData.buffer);

    const isMaskTargetsEmpty = Object.keys(maskTargets).length === 0;

    const isRgbMaskTargetsCached = isRgbMaskTargets(maskTargets);

    if (maskData.channels > 2) {
      for (let i = 0; i < overlay.length; i++) {
        const [r, g, b] = getRgbFromMaskData(targets, maskData.channels, i);

        const currentHexCode = rgbToHexCached([r, g, b]);

        if (
          // #000000 is semantically treated as background
          currentHexCode === "#000000" ||
          // don't render color if hex is not in mask targets, unless mask targets is completely empty
          (!isMaskTargetsEmpty &&
            isRgbMaskTargetsCached &&
            !(currentHexCode in maskTargets))
        ) {
          targets[i] = 0;
          continue;
        }

        overlay[i] = get32BitColor([r, g, b]);

        if (isRgbMaskTargetsCached) {
          targets[i] = (maskTargets as RgbMaskTargets)[
            currentHexCode
          ].intTarget;
        }
      }

      // discard the buffer values of other channels
      maskData.buffer = maskData.buffer.slice(0, overlay.length);
    } else {
      const cache = {};

      let color;
      if (maskTargets && Object.keys(maskTargets).length === 1) {
        color = get32BitColor(
          await requestColor(coloring.pool, coloring.seed, field)
        );
      }

      const getColor = (i) => {
        i = Math.round(Math.abs(i)) % coloring.targets.length;

        if (!(i in cache)) {
          cache[i] = get32BitColor(coloring.targets[i]);
        }

        return cache[i];
      };

      // these for loops must be fast. no "in" or "of" syntax
      for (let i = 0; i < overlay.length; i++) {
        if (targets[i] !== 0) {
          if (
            !(targets[i] in maskTargets) &&
            !isMaskTargetsEmpty &&
            !isRgbMaskTargetsCached
          ) {
            targets[i] = 0;
          } else {
            overlay[i] = color ? color : getColor(targets[i]);
          }
        }
      }
    }
  },
};

interface Init {
  headers: HeadersInit;
  origin: string;
  pathPrefix?: string;
}

type InitMethod = Init & ReaderMethod;

const init = ({ origin, headers, pathPrefix }: Init) => {
  setFetchFunction(origin, headers, pathPrefix);
};

type Method =
  | InitMethod
  | ProcessSampleMethod
  | RequestFrameChunkMethod
  | ResolveColorMethod
  | SetStreamMethod;

onmessage = ({ data: { method, ...args } }: MessageEvent<Method>) => {
  switch (method) {
    case "init":
      init(args as Init);
      return;
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
