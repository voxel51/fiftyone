/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import {
  DENSE_LABELS,
  DETECTIONS,
  DYNAMIC_EMBEDDED_DOCUMENT,
  EMBEDDED_DOCUMENT,
  getCls,
  getFetchFunction,
  HEATMAP,
  LABEL_LIST,
  Schema,
  setFetchFunction,
  Stage,
  VALID_LABEL_TYPES,
} from "@fiftyone/utilities";
import { decode as decodePng } from "fast-png";
import { decode as decodeJpg } from "jpeg-js";
import { CHUNK_SIZE } from "../constants";
import { OverlayMask } from "../numpy";
import {
  BaseConfig,
  Coloring,
  Colorscale,
  CustomizeColor,
  FrameChunk,
  FrameSample,
  LabelTagColor,
  Sample,
} from "../state";
import { DeserializerFactory } from "./deserializer";
import { indexedPngBufferToRgb } from "./indexed-png-decoder";
import { PainterFactory } from "./painter";
import { mapId } from "./shared";
import { process3DLabels } from "./threed-label-processor";

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

const painterFactory = PainterFactory(requestColor);

const ALL_VALID_LABELS = new Set(VALID_LABEL_TYPES);

/**
 * Some label types (example: segmentation, heatmap) can have their overlay data stored on-disk,
 * we want to impute the relevant mask property of these labels from what's stored in the disk
 */
const imputeOverlayFromPath = async (
  field: string,
  label: Record<string, any>,
  coloring: Coloring,
  customizeColorSetting: CustomizeColor[],
  colorscale: Colorscale,
  buffers: ArrayBuffer[],
  sources: { [path: string]: string },
  cls: string
) => {
  // handle all list types here
  if (cls === DETECTIONS) {
    label?.detections?.forEach((detection) =>
      imputeOverlayFromPath(
        field,
        detection,
        coloring,
        customizeColorSetting,
        colorscale,
        buffers,
        {},
        cls
      )
    );
    return;
  }

  // overlay path is in `map_path` property for heatmap, or else, it's in `mask_path` property (for segmentation or detection)
  const overlayPathField = cls === HEATMAP ? "map_path" : "mask_path";
  const overlayField = overlayPathField === "map_path" ? "map" : "mask";

  if (
    Object.hasOwn(label, overlayField) ||
    !Object.hasOwn(label, overlayPathField)
  ) {
    // nothing to be done
    return;
  }

  // convert absolute file path to a URL that we can "fetch" from
  const overlayImageUrl = getSampleSrc(
    sources[`${field}.${overlayPathField}`] || label[overlayPathField]
  );

  const overlayImageBuffer: ArrayBuffer = await getFetchFunction()(
    "GET",
    overlayImageUrl,
    null,
    "arrayBuffer"
  );

  let overlayData;

  if (overlayImageUrl.endsWith(".jpg")) {
    overlayData = decodeJpg(overlayImageBuffer, { useTArray: true });
  } else {
    overlayData = decodePng(overlayImageBuffer);
  }

  if (overlayData.palette?.length) {
    overlayData.data = indexedPngBufferToRgb(
      overlayData.data,
      overlayData.depth,
      overlayData.palette
    );
    overlayData.channels = 3;
  }

  const width = overlayData.width;
  const height = overlayData.height;

  const numChannels =
    overlayData.channels ?? overlayData.data.length / (width * height);

  const overlayMask: OverlayMask = {
    buffer: overlayData.data.buffer,
    channels: numChannels,
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
  sample: ProcessSample["sample"],
  coloring: ProcessSample["coloring"],
  prefix = "",
  sources: { [key: string]: string },
  customizeColorSetting: ProcessSample["customizeColorSetting"],
  colorscale: ProcessSample["colorscale"],
  labelTagColors: ProcessSample["labelTagColors"],
  selectedLabelTags: ProcessSample["selectedLabelTags"],
  schema: Schema
): Promise<ArrayBuffer[]> => {
  const buffers: ArrayBuffer[] = [];
  const promises = [];

  for (const field in sample) {
    let labels = sample[field];
    if (!Array.isArray(labels)) {
      labels = [labels];
    }
    const cls = getCls(`${prefix ? prefix : ""}${field}`, schema);

    for (const label of labels) {
      if (!label) {
        continue;
      }

      if (DENSE_LABELS.has(cls)) {
        await imputeOverlayFromPath(
          `${prefix || ""}${field}`,
          label,
          coloring,
          customizeColorSetting,
          colorscale,
          buffers,
          sources,
          cls
        );
      }

      if (cls in DeserializerFactory) {
        DeserializerFactory[cls](label, buffers);
      }

      if ([EMBEDDED_DOCUMENT, DYNAMIC_EMBEDDED_DOCUMENT].includes(cls)) {
        const moreBuffers = await processLabels(
          label,
          coloring,
          `${prefix ? prefix : ""}${field}.`,
          sources,
          customizeColorSetting,
          colorscale,
          labelTagColors,
          selectedLabelTags,
          schema
        );
        buffers.push(...moreBuffers);
      }

      if (ALL_VALID_LABELS.has(cls)) {
        if (cls in LABEL_LIST) {
          if (Array.isArray(label[LABEL_LIST[cls]])) {
            label[LABEL_LIST[cls]].forEach(mapId);
          }
        } else {
          mapId(label);
        }
      }

      if (painterFactory[cls]) {
        promises.push(
          painterFactory[cls](
            prefix ? prefix + field : field,
            label,
            coloring,
            customizeColorSetting,
            colorscale,
            labelTagColors,
            selectedLabelTags
          )
        );
      }
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

export interface ProcessSample {
  uuid: string;
  sample: Sample & FrameSample;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  labelTagColors: LabelTagColor;
  colorscale: Colorscale;
  selectedLabelTags: string[];
  sources: { [path: string]: string };
  schema: Schema;
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = ({
  sample,
  uuid,
  coloring,
  sources,
  customizeColorSetting,
  colorscale,
  selectedLabelTags,
  labelTagColors,
  schema,
}: ProcessSample) => {
  mapId(sample);

  let bufferPromises = [];

  if (sample?._media_type === "point-cloud" || sample?._media_type === "3d") {
    process3DLabels(schema, sample);
  } else {
    bufferPromises = [
      processLabels(
        sample,
        coloring,
        null,
        sources,
        customizeColorSetting,
        colorscale,
        labelTagColors,
        selectedLabelTags,
        schema
      ),
    ];
  }

  if (sample.frames && sample.frames.length) {
    bufferPromises = [
      ...bufferPromises,
      ...sample.frames
        .map((frame) =>
          processLabels(
            frame,
            coloring,
            "frames.",
            sources,
            customizeColorSetting,
            colorscale,
            labelTagColors,
            selectedLabelTags,
            schema
          )
        )
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
        customizeColorSetting,
        colorscale,
        labelTagColors,
        selectedLabelTags,
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
  customizeColorSetting: CustomizeColor[];
  colorscale: Colorscale;
  labelTagColors: LabelTagColor;
  selectedLabelTags: string[];
  schema: Schema;
}

const createReader = ({
  chunkSize,
  coloring,
  customizeColorSetting,
  colorscale,
  labelTagColors,
  selectedLabelTags,
  frameCount,
  frameNumber,
  sampleId,
  dataset,
  view,
  group,
  schema,
}: {
  chunkSize: number;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  colorscale: Colorscale;
  labelTagColors: LabelTagColor;
  selectedLabelTags: string[];
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  dataset: string;
  view: Stage[];
  group: BaseConfig["group"];
  schema: Schema;
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
              slice: group?.name,
            },
            "json",
            2
          );

        return await (async () => {
          try {
            const { frames, range } = await call();

            controller.enqueue({
              frames,
              range,
              coloring,
              customizeColorSetting,
              colorscale,
              labelTagColors,
              selectedLabelTags,
              schema,
            });
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
          processLabels(
            frame,
            value.coloring,
            "frames.",
            {},
            value.customizeColorSetting,
            value.colorscale,
            value.labelTagColors,
            value.selectedLabelTags,
            value.schema
          )
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
  customizeColorSetting: CustomizeColor[];
  colorscale: Colorscale;
  labelTagColors: LabelTagColor;
  selectedLabelTags: string[];
  frameCount: number;
  frameNumber: number;
  sampleId: string;
  uuid: string;
  dataset: string;
  view: Stage[];
  group: BaseConfig["group"];
  schema: Schema;
}

type SetStreamMethod = ReaderMethod & SetStream;

const setStream = ({
  coloring,
  customizeColorSetting,
  colorscale,
  selectedLabelTags,
  labelTagColors,
  frameCount,
  frameNumber,
  sampleId,
  uuid,
  dataset,
  view,
  group,
  schema,
}: SetStream) => {
  stream && stream.cancel();
  streamId = uuid;

  stream = createReader({
    coloring,
    customizeColorSetting,
    colorscale,
    selectedLabelTags,
    labelTagColors,
    chunkSize: CHUNK_SIZE,
    frameCount: frameCount,
    frameNumber: frameNumber,
    sampleId,
    dataset,
    view,
    group,
    schema,
  });

  stream.reader.read().then(getSendChunk(uuid));
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

if (typeof onmessage !== "undefined") {
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
        console.warn("Unknown method: ", method);
    }
  };
}
