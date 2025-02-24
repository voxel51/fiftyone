/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  DENSE_LABELS,
  DETECTION,
  DETECTIONS,
  DYNAMIC_EMBEDDED_DOCUMENT,
  EMBEDDED_DOCUMENT,
  LABEL_LIST,
  Schema,
  Stage,
  VALID_LABEL_TYPES,
  getCls,
  getFetchFunction,
  setFetchFunction,
} from "@fiftyone/utilities";
import { CHUNK_SIZE } from "../constants";
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
import { decodeOverlayOnDisk } from "./disk-overlay-decoder";
import { PainterFactory } from "./painter";
import colorResolve from "./resolve-color";
import {
  getOverlayFieldFromCls,
  mapId,
  RENDER_STATUS_DECODED,
  RENDER_STATUS_PAINTED,
  RENDER_STATUS_PENDING,
} from "./shared";
import { process3DLabels } from "./threed-label-processor";

interface ResolveColor {
  key: string | number;
  seed: number;
  color: string;
}

type ResolveColorMethod = ReaderMethod & ResolveColor;

const [requestColor, resolveColor] = colorResolve();

const painterFactory = PainterFactory(requestColor);

const ALL_VALID_LABELS = new Set(VALID_LABEL_TYPES);

const shouldProcessLabel = ({
  field,
  label,
  activePaths,
  prefix,
}: {
  prefix: string;
  field: string;
  label: any;
  activePaths: string[];
}) => {
  // check if it has a valid render status, in which case it takes precendence over activePaths
  // it means this label was processed before and we should re-render it
  const currentLabelRenderStatus = label?.renderStatus;

  if (
    currentLabelRenderStatus === RENDER_STATUS_PAINTED ||
    currentLabelRenderStatus === RENDER_STATUS_DECODED ||
    currentLabelRenderStatus === RENDER_STATUS_PENDING
  ) {
    return true;
  }

  return activePaths?.includes(`${prefix ?? ""}${field}`);
};

/**
 * This function processes labels in active paths in a recursive manner. It follows the following steps:
 * 1. Deserialize masks. Accumulate promises.
 * 2. Await mask path decoding to finish.
 * 3. Start painting overlays. Accumulate promises.
 * 4. Await overlay painting to finish.
 * 5. Start bitmap generation. Accumulate promises.
 * 6. Await bitmap generation to finish.
 * 7. Transfer bitmaps and mask targets array buffers back to the main thread.
 */
const processLabels = async (
  sample: ProcessSample["sample"],
  coloring: ProcessSample["coloring"],
  prefix = "",
  sources: { [key: string]: string },
  customizeColorSetting: ProcessSample["customizeColorSetting"],
  colorscale: ProcessSample["colorscale"],
  labelTagColors: ProcessSample["labelTagColors"],
  selectedLabelTags: ProcessSample["selectedLabelTags"],
  schema: ProcessSample["schema"],
  activePaths: ProcessSample["activePaths"]
): Promise<[Promise<ImageBitmap[]>[], ArrayBuffer[]]> => {
  const maskPathDecodingPromises: Promise<void>[] = [];
  const painterPromises: Promise<void>[] = [];
  const bitmapPromises: Promise<ImageBitmap[]>[] = [];
  const maskTargetsBuffers: ArrayBuffer[] = [];

  // mask deserialization / on-disk overlay decoding loop
  for (const field in sample) {
    let labels = sample[field];
    if (!Array.isArray(labels)) {
      labels = [labels];
    }
    const cls = getCls(`${prefix ? prefix : ""}${field}`, schema);

    if (!cls) {
      continue;
    }

    for (const label of labels) {
      if (!label) {
        continue;
      }

      if (DENSE_LABELS.has(cls)) {
        if (
          shouldProcessLabel({
            prefix,
            field,
            label,
            activePaths,
          })
        ) {
          maskPathDecodingPromises.push(
            // note: if it's an already decoded label, this will be cheap
            decodeOverlayOnDisk(
              `${prefix || ""}${field}`,
              label,
              coloring,
              customizeColorSetting,
              colorscale,
              sources,
              cls,
              maskPathDecodingPromises,
              maskTargetsBuffers
            )
          );

          if (cls in DeserializerFactory) {
            DeserializerFactory[cls](label, maskTargetsBuffers);
            label.renderStatus = RENDER_STATUS_DECODED;
          }
        } else {
          // we'll process this label asynchronously later
          label.renderStatus = null;
        }
      }

      if ([EMBEDDED_DOCUMENT, DYNAMIC_EMBEDDED_DOCUMENT].includes(cls)) {
        const [moreBitmapPromises, moreMaskTargetsBuffers] =
          await processLabels(
            label,
            coloring,
            `${prefix ? prefix : ""}${field}.`,
            sources,
            customizeColorSetting,
            colorscale,
            labelTagColors,
            selectedLabelTags,
            schema,
            activePaths
          );
        bitmapPromises.push(...moreBitmapPromises);
        maskTargetsBuffers.push(...moreMaskTargetsBuffers);
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
    }
  }

  await Promise.allSettled(maskPathDecodingPromises);

  // overlay painting loop
  for (const field in sample) {
    let labels = sample[field];

    if (!Array.isArray(labels)) {
      labels = [labels];
    }

    const cls = getCls(`${prefix ? prefix : ""}${field}`, schema);

    if (!cls) {
      continue;
    }

    for (const label of labels) {
      if (!label) {
        continue;
      }

      if (
        shouldProcessLabel({
          prefix,
          field,
          label,
          activePaths,
        })
      ) {
        if (painterFactory[cls]) {
          painterPromises.push(
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
  }

  await Promise.allSettled(painterPromises);

  // bitmap generation loop
  for (const field in sample) {
    let labels = sample[field];

    if (!Array.isArray(labels)) {
      labels = [labels];
    }

    const cls = getCls(`${prefix ? prefix : ""}${field}`, schema);

    if (!cls) {
      continue;
    }

    for (const label of labels) {
      if (label?.renderStatus !== "painted") {
        continue;
      }

      collectBitmapPromises(label, cls, bitmapPromises);
    }
  }

  return [bitmapPromises, maskTargetsBuffers];
};

const collectBitmapPromises = (label, cls, bitmapPromises) => {
  if (cls === DETECTIONS) {
    label?.detections?.forEach((detection) =>
      collectBitmapPromises(detection, DETECTION, bitmapPromises)
    );
    return;
  }

  const overlayFields = getOverlayFieldFromCls(cls);
  const overlayField = overlayFields.canonical;

  if (label[overlayField]) {
    const [height, width] = label[overlayField].data.shape;

    if (!height || !width) {
      label[overlayField].image = null;
      return;
    }

    const imageData = new ImageData(
      new Uint8ClampedArray(label[overlayField].image),
      width,
      height
    );

    // set raw image to null - will be garbage collected
    // we don't need it anymore since we copied to ImageData
    label[overlayField].image = null;

    bitmapPromises.push(
      new Promise((resolve) => {
        createImageBitmap(imageData).then((imageBitmap) => {
          label[overlayField].bitmap = imageBitmap;
          resolve(imageBitmap);
        });
      })
    );
  }
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
  activePaths: string[];
}

type ProcessSampleMethod = ReaderMethod & ProcessSample;

const processSample = async ({
  sample,
  uuid,
  coloring,
  sources,
  customizeColorSetting,
  colorscale,
  selectedLabelTags,
  labelTagColors,
  schema,
  activePaths,
}: ProcessSample) => {
  if (!sample) {
    // edge case where looker hasn't been associated with a sample yet
    // but `updateSample` was called anyway, say, due to user switching colors
    // as soon as the app loads but before grid is ready
    postMessage({
      method: "processSample",
      uuid,
      error: "sample not attached",
    });
    return;
  }

  mapId(sample);

  const imageBitmapPromises: Promise<ImageBitmap[]>[] = [];
  let maskTargetsBuffers: ArrayBuffer[] = [];

  if (sample?._media_type === "point-cloud" || sample?._media_type === "3d") {
    // we process all 3d labels regardless of active paths
    process3DLabels(schema, sample);
  } else {
    const [bitmapPromises, moreMaskTargetsBuffers] = await processLabels(
      sample,
      coloring,
      null,
      sources,
      customizeColorSetting,
      colorscale,
      labelTagColors,
      selectedLabelTags,
      schema,
      activePaths
    );

    if (bitmapPromises.length !== 0) {
      imageBitmapPromises.push(...bitmapPromises);
    }

    if (moreMaskTargetsBuffers.length !== 0) {
      maskTargetsBuffers.push(...moreMaskTargetsBuffers);
    }
  }

  // this usually only applies to thumbnail frame
  // other frames are processed in the stream (see `getSendChunk`)
  if (sample.frames?.length) {
    const allFramePromises: ReturnType<typeof processLabels>[] = [];
    for (const frame of sample.frames) {
      allFramePromises.push(
        processLabels(
          frame,
          coloring,
          "frames.",
          sources,
          customizeColorSetting,
          colorscale,
          labelTagColors,
          selectedLabelTags,
          schema,
          activePaths
        )
      );
    }
    const framePromisesResolved = await Promise.all(allFramePromises);
    for (const [bitmapPromises, buffers] of framePromisesResolved) {
      if (bitmapPromises.length !== 0) {
        imageBitmapPromises.push(...bitmapPromises);
      }

      if (buffers.length !== 0) {
        maskTargetsBuffers.push(...buffers);
      }
    }
  }

  Promise.all(imageBitmapPromises).then((bitmaps) => {
    const flatBitmaps = bitmaps.flat() ?? [];
    const flatMaskTargetsBuffers = maskTargetsBuffers.flat() ?? [];
    const transferables = [...flatBitmaps, ...flatMaskTargetsBuffers];
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
      transferables
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
  activePaths: string[];
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
  activePaths,
}: {
  activePaths: string[];
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
              activePaths,
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
  async ({ value }: { done: boolean; value?: FrameChunkResponse }) => {
    if (value) {
      const allLabelsPromiseResults = await Promise.allSettled(
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
            value.schema,
            value.activePaths
          )
        )
      );

      const allLabelsResults = allLabelsPromiseResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      const allBuffers = allLabelsResults.map((result) => result[1]).flat();

      const allBitmapsPromises = allLabelsResults
        .map((result) => result[0])
        .flat();

      const bitmapPromiseResults = (
        await Promise.allSettled(allBitmapsPromises)
      )
        .map((result) => (result.status === "fulfilled" ? result.value : []))
        .flat();

      const transferables = [...bitmapPromiseResults, ...allBuffers];
      postMessage(
        {
          method: "frameChunk",
          frames: value.frames,
          range: value.range,
          uuid,
        },
        // @ts-ignore
        transferables
      );
    }
  };

interface RequestFrameChunk {
  uuid: string;
}

type RequestFrameChunkMethod = ReaderMethod & RequestFrameChunk;

const requestFrameChunk = ({ uuid }: RequestFrameChunk) => {
  if (uuid === streamId) {
    stream?.reader.read().then(getSendChunk(uuid));
  }
};

interface SetStream {
  activePaths: string[];
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
  activePaths,
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
    activePaths,
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
