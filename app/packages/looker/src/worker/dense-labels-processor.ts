/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

// This file runs in a separate worker context triggered by overlay processors.

export type DenseLabelRenderStatus =
  | "deferred"
  | "decoding"
  | "decoded"
  | "painting"
  | "painted"
  | "ready";
/**
 * This module processes non-dense labels. It follows the following steps:
 * 1. Deserialize masks. Accumulate promises.
 * 2. Await mask path decoding to finish.
 * 3. Start painting overlays. Accumulate promises.
 * 4. Await overlay painting to finish.
 * 5. Start bitmap generation. Accumulate promises.
 * 6. Await bitmap generation to finish.
 * 7. Transfer bitmaps and mask targets array buffers back to the main thread.
 */

import {
  DENSE_LABELS,
  DETECTION,
  DETECTIONS,
  DYNAMIC_EMBEDDED_DOCUMENT,
  EMBEDDED_DOCUMENT,
  LABEL_LIST,
  Schema,
  VALID_LABEL_TYPES,
  getCls,
  setFetchFunction,
} from "@fiftyone/utilities";

import {
  Coloring,
  Colorscale,
  CustomizeColor,
  LabelTagColor,
} from "../../state";
import colorResolve from "../color-resolver";
import { getOverlayFieldFromCls, mapId } from "../shared";
import { decodeOverlayOnDisk } from "./disk-overlay-decoder";
import { PainterFactory } from "./painter";

const [requestColor, resolveColor] = colorResolve();

const painterFactory = PainterFactory(requestColor);
const ALL_VALID_LABELS = new Set(VALID_LABEL_TYPES);

interface ReaderMethod {
  method: string;
}

interface DenseLabelProcessRequest {
  uuid: string;
  labels: any; // Could be a single label or collection of labels
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
  labelTagColors: LabelTagColor;
  colorscale: Colorscale;
  selectedLabelTags: string[];
  sources: { [path: string]: string };
  schema: Schema;
  prefix?: string;
}

type DenseLabelProcessMethod = ReaderMethod & DenseLabelProcessRequest;

interface Init {
  headers: HeadersInit;
  origin: string;
  pathPrefix?: string;
}

type InitMethod = Init & ReaderMethod;

const init = ({ origin, headers, pathPrefix }: Init) => {
  setFetchFunction(origin, headers, pathPrefix);
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

    // set raw image to null - it will be garbage collected
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

const processDenseLabels = async (
  labels: any,
  coloring: Coloring,
  prefix: string | undefined,
  sources: { [key: string]: string },
  customizeColorSetting: CustomizeColor[],
  colorscale: Colorscale,
  labelTagColors: LabelTagColor,
  selectedLabelTags: string[],
  schema: Schema
): Promise<[Promise<ImageBitmap[]>[], ArrayBuffer[]]> => {
  const maskPathDecodingPromises: Promise<void>[] = [];
  const painterPromises: Promise<void>[] = [];
  const bitmapPromises: Promise<ImageBitmap[]>[] = [];
  const maskTargetsBuffers: ArrayBuffer[] = [];

  // Process labels (could be array or single)
  const processSingleLabel = async (field: string, label: any, cls: string) => {
    if (!label) return;

    // If label is dense, we do the entire chain here
    if (DENSE_LABELS.has(cls)) {
      // set renderStatus to 'decoding'
      label.renderStatus = "decoding";

      // 1. Decode Overlays
      await decodeOverlayOnDisk(
        `${prefix || ""}${field}`,
        label,
        coloring,
        customizeColorSetting,
        colorscale,
        sources,
        cls,
        maskPathDecodingPromises,
        maskTargetsBuffers
      );

      await Promise.allSettled(maskPathDecodingPromises);

      // set renderStatus to 'rendering' before painting
      label.renderStatus = "rendering";

      // 2. Paint Overlays
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

      await Promise.allSettled(painterPromises);

      // set renderStatus to 'decoded' before bitmap generation
      label.renderStatus = "decoded";

      // 3. Create Bitmaps
      collectBitmapPromises(label, cls, bitmapPromises);

      // Wait for bitmaps
      await Promise.allSettled(bitmapPromises.map((p) => p));

      // Finally set renderStatus to 'ready'
      label.renderStatus = "ready";
    }

    // Handle sub-labels (e.g., dynamic embedded documents)
    if ([EMBEDDED_DOCUMENT, DYNAMIC_EMBEDDED_DOCUMENT].includes(cls)) {
      // Recursively process nested labels
      for (const subField in label) {
        let subLabels = label[subField];
        if (!Array.isArray(subLabels)) {
          subLabels = [subLabels];
        }

        const subCls = getCls(
          `${prefix ? prefix : ""}${field}.${subField}`,
          schema
        );
        if (!subCls) continue;

        for (const sl of subLabels) {
          await processSingleLabel(`${field}.${subField}`, sl, subCls);
        }
      }
    }

    // If it's a valid label, map IDs (if necessary)
    if (ALL_VALID_LABELS.has(cls)) {
      if (cls in LABEL_LIST) {
        if (Array.isArray(label[LABEL_LIST[cls]])) {
          label[LABEL_LIST[cls]].forEach(mapId);
        }
      } else {
        mapId(label);
      }
    }
  };

  // If labels is a single label or an object, treat it consistently
  if (!Array.isArray(labels)) {
    labels = [labels];
  }

  // We assume labels come with a 'field' property or are keyed somehow in main code
  // For simplicity, we assume caller provides them as {fieldName: labelData} or as an array.
  // If needed, adjust this logic based on how data is provided.
  for (const item of labels) {
    for (const field in item) {
      let fieldLabels = item[field];
      if (!Array.isArray(fieldLabels)) {
        fieldLabels = [fieldLabels];
      }
      const cls = getCls(`${prefix ? prefix : ""}${field}`, schema);
      if (!cls) continue;

      for (const label of fieldLabels) {
        await processSingleLabel(field, label, cls);
      }
    }
  }

  return [bitmapPromises, maskTargetsBuffers];
};

if (typeof onmessage !== "undefined") {
  onmessage = async ({ data: { method, ...args } }: MessageEvent) => {
    switch (method) {
      case "init":
        init(args as Init);
        return;
      case "processDenseLabels": {
        const {
          uuid,
          labels,
          coloring,
          customizeColorSetting,
          labelTagColors,
          colorscale,
          selectedLabelTags,
          sources,
          schema,
          prefix,
        } = args as DenseLabelProcessRequest;

        // Process dense labels
        const [bitmapPromises, maskBuffers] = await processDenseLabels(
          labels,
          coloring,
          prefix,
          sources,
          customizeColorSetting,
          colorscale,
          labelTagColors,
          selectedLabelTags,
          schema
        );

        // Resolve all bitmaps
        const bitmapResults = (
          await Promise.all(bitmapPromises.map((p) => p))
        ).flat();

        const transferables = [...bitmapResults, ...maskBuffers];

        // Post processed labels back
        postMessage(
          {
            method: "denseLabelsProcessed",
            uuid,
            labels,
          },
          // @ts-ignore
          transferables
        );
        return;
      }
      case "resolveColor":
        resolveColor(args as ResolveColor);
        return;
      default:
        console.warn("Unknown method: ", method);
    }
  };
}
