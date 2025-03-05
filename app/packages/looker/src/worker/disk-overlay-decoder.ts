import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTION, DETECTIONS } from "@fiftyone/utilities";
import { Coloring, CustomizeColor } from "..";
import { OverlayMask } from "../numpy";
import { Colorscale } from "../state";
import { decodeMaskOnDisk } from "./mask-decoder";
import { enqueueFetch } from "./pooled-fetch";
import { getOverlayFieldFromCls, RENDER_STATUS_DECODED } from "./shared";

export type IntermediateMask = {
  data: OverlayMask;
  image: ArrayBuffer;
};

/**
 * Some label types (example: segmentation, heatmap) can have their overlay data stored on-disk,
 * we want to impute the relevant mask property of these labels from what's stored in the disk
 */
export const decodeOverlayOnDisk = async (
  field: string,
  label: Record<string, any>,
  coloring: Coloring,
  customizeColorSetting: CustomizeColor[],
  colorscale: Colorscale,
  sources: { [path: string]: string },
  cls: string,
  maskPathDecodingPromises: Promise<void>[] = [],
  maskTargetsBuffers: ArrayBuffer[] = [],
  overlayCollectionProcessingParams:
    | { idx: number; cls: string }
    | undefined = undefined
) => {
  // handle all list types here
  if (cls === DETECTIONS && label.detections) {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < label.detections.length; i++) {
      const detection = label.detections[i];
      promises.push(
        decodeOverlayOnDisk(
          field,
          detection,
          coloring,
          customizeColorSetting,
          colorscale,
          sources,
          DETECTION,
          maskPathDecodingPromises,
          maskTargetsBuffers,
          { idx: i, cls: DETECTIONS }
        )
      );
    }
    maskPathDecodingPromises.push(...promises);
  }

  const overlayFields = getOverlayFieldFromCls(cls);
  const overlayPathField = overlayFields.disk;
  const overlayField = overlayFields.canonical;

  if (Boolean(label[overlayField]) || !Object.hasOwn(label, overlayPathField)) {
    // it's possible we're just re-coloring, in which case re-init mask image and set bitmap to null
    if (
      label[overlayField] &&
      (label[overlayField].bitmap?.height ||
        label[overlayField].bitmap?.width) &&
      !label[overlayField].image
    ) {
      const height = label[overlayField].bitmap.height;
      const width = label[overlayField].bitmap.width;

      // close the copied bitmap
      label[overlayField].bitmap.close();
      label[overlayField].bitmap = null;

      label[overlayField].image = new ArrayBuffer(height * width * 4);
      label[overlayField].bitmap.close();
      label[overlayField].bitmap = null;
    }
    // nothing to be done
    return;
  }

  // if we have an explicit source defined from sample.urls, use that
  // otherwise, use the path field from the label
  let source = sources[`${field}.${overlayPathField}`];

  if (typeof overlayCollectionProcessingParams !== "undefined") {
    // example: for detections, we need to access the source from the parent label
    // like: if field is "prediction_masks", we're trying to get "predictiion_masks.detections[INDEX].mask"
    source =
      sources[
        `${field}.${overlayCollectionProcessingParams.cls.toLocaleLowerCase()}[${
          overlayCollectionProcessingParams.idx
        }].${overlayPathField}`
      ];
  }

  // convert absolute file path to a URL that we can "fetch" from
  const overlayImageUrl = getSampleSrc(source || label[overlayPathField]);

  let overlayImageBlob: Blob;
  try {
    const overlayImageFetchResponse = await enqueueFetch({
      url: overlayImageUrl,
      options: { priority: "low" },
    });
    overlayImageBlob = await overlayImageFetchResponse.blob();
  } catch (e) {
    console.error(e);
    // skip decoding if fetch fails altogether
    return;
  }

  let overlayMask: OverlayMask;

  try {
    overlayMask = await decodeMaskOnDisk(overlayImageBlob, cls);

    if (!overlayMask) {
      console.error("Overlay mask decoding failed");
      return;
    }
  } catch (e) {
    console.error(e);
    return;
  }

  const [overlayHeight, overlayWidth] = overlayMask.shape;

  // set the `mask` property for this label
  // we need to do this because we need raw image pixel data
  // to iterate through and paint it with the color
  // defined by the user for this particular label
  label[overlayField] = {
    data: overlayMask,
    image: new ArrayBuffer(overlayWidth * overlayHeight * 4),
  } as IntermediateMask;

  label.renderStatus = RENDER_STATUS_DECODED;

  // no need to transfer image's buffer
  //since we'll be constructing ImageBitmap and transfering that
  maskTargetsBuffers.push(overlayMask.buffer);
};
