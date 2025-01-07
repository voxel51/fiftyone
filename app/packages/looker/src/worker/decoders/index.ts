import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTION, DETECTIONS } from "@fiftyone/utilities";
import type { Coloring, CustomizeColor } from "../..";
import type { Colorscale } from "../../state";
import { enqueueFetch } from "../pooled-fetch";
import { getOverlayFieldFromCls } from "../shared";
import decodeCanvas from "./canvas";
import decodeInline from "./inline";
import decodeTiff from "./tiff";
import type { BlobDecoder, Decodeables } from "./types";

interface DecodeParameters {
  cls: string;
  coloring: Coloring;
  colorscale: Colorscale;
  customizeColorSetting: CustomizeColor[];
  field: string;
  label: Decodeables;
  maskPathDecodingPromises?: Promise<void>[];
  maskTargetsBuffers?: ArrayBuffer[];
  overlayCollectionProcessingParams?: { idx: number; cls: string };
  sources: { [path: string]: string };
}

const IMAGE_DECODERS: { [key: string]: BlobDecoder } = {
  jpeg: decodeCanvas,
  jpg: decodeCanvas,
  png: decodeCanvas,
  tif: decodeTiff,
  tiff: decodeTiff,
};

/**
 * Some label types (example: segmentation, heatmap) can have their overlay
 * data stored on-disk, we want to impute the relevant mask property of these
 * labels from what's stored in the disk
 */
const decode = async ({ field, label, ...params }: DecodeParameters) => {
  // handle all list types here
  if (params.cls === DETECTIONS && label?.detections) {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < label.detections.length; i++) {
      promises.push(
        decode({
          field,
          label: label.detections[i],
          cls: DETECTION,
          overlayCollectionProcessingParams: { idx: i, cls: DETECTIONS },
          ...params,
        })
      );
    }
    params.maskPathDecodingPromises.push(...promises);
  }

  const overlayFields = getOverlayFieldFromCls(params.cls);
  const overlayPathField = overlayFields.disk;
  const overlayField = overlayFields.canonical;

  const data = label[overlayField];
  if (typeof data === "string") {
    const mask = decodeInline(data);
    if (!mask) {
      return;
    }

    params.maskTargetsBuffers.push(mask.buffer);
    const [height, width] = mask.shape;
    label[overlayField] = {
      data: mask,
      image: new ArrayBuffer(height * width * 4),
    };
    return;
  }

  if (!Object.hasOwn(label, overlayPathField)) {
    return;
  }

  if (data?.bitmap && !data?.image) {
    const height = label[overlayField].bitmap.height;
    const width = label[overlayField].bitmap.width;

    // close the copied bitmap
    data.bitmap.close();
    data.bitmap = null;

    data.image = new ArrayBuffer(height * width * 4);
    return;
  }

  // if we have an explicit source defined from sample.urls, use that
  // otherwise, use the path field from the label
  let source = params.sources[`${field}.${overlayPathField}`];

  if (typeof params.overlayCollectionProcessingParams !== "undefined") {
    // example: for detections, we need to access the source from the parent
    // label
    //
    // e.g. if field is "prediction_masks", we're trying to get
    // "predictiion_masks.detections[INDEX].mask"
    const subfield =
      params.overlayCollectionProcessingParams.cls.toLocaleLowerCase();
    const idx = params.overlayCollectionProcessingParams.idx;
    source = params.sources[`${field}.${subfield}[${idx}].${overlayPathField}`];
  }

  // convert absolute file path to a URL that we can "fetch" from
  const overlayImageUrl = getSampleSrc(source || label[overlayPathField]);
  const overlayImageFetchResponse = await enqueueFetch({
    url: overlayImageUrl,
    options: { priority: "low" },
  });
  const blob = await overlayImageFetchResponse.blob();
  const extension = overlayImageUrl.split(".").slice(-1)[0];
  const overlayMask = await IMAGE_DECODERS[extension](blob);
  const [overlayHeight, overlayWidth] = overlayMask.shape;

  // set the `mask` property for this label
  // we need to do this because we need raw image pixel data
  // to iterate through and paint it with the color
  // defined by the user for this particular label
  label[overlayField] = {
    data: overlayMask,
    image: new ArrayBuffer(overlayWidth * overlayHeight * 4),
  };

  // no need to transfer image's buffer
  // since we'll be constructing ImageBitmap and transfering that
  params.maskTargetsBuffers.push(overlayMask.buffer);
};

export default decode;
