import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTION, DETECTIONS } from "@fiftyone/utilities";
import type { Coloring, CustomizeColor } from "..";
import type { OverlayMask } from "../numpy";
import type { Colorscale } from "../state";
import { decodeWithCanvas } from "./canvas-decoder";
import { enqueueFetch } from "./pooled-fetch";
import { getOverlayFieldFromCls } from "./shared";

export type IntermediateMask = {
  data: OverlayMask;
  image: ArrayBuffer;
};

/**
 * Some label types (example: segmentation, heatmap) can have their overlay
 * data stored on-disk, we want to impute the relevant mask property of these
 * labels from what's stored in the disk
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
  maskTargetsBuffers: ArrayBuffer[] = []
) => {
  // handle all list types here
  if (cls === DETECTIONS) {
    const promises: Promise<void>[] = [];
    for (const detection of label.detections) {
      promises.push(
        decodeOverlayOnDisk(
          field,
          detection,
          coloring,
          customizeColorSetting,
          colorscale,
          {},
          DETECTION,
          maskPathDecodingPromises,
          maskTargetsBuffers
        )
      );
    }
    maskPathDecodingPromises.push(...promises);
  }

  const overlayFields = getOverlayFieldFromCls(cls);
  const overlayPathField = overlayFields.disk;
  const overlayField = overlayFields.canonical;

  if (Boolean(label[overlayField]) || !Object.hasOwn(label, overlayPathField)) {
    // it's possible we're just re-coloring, in which case re-init mask image
    // and set bitmap to null
    if (label[overlayField]?.bitmap && !label[overlayField]?.image) {
      const height = label[overlayField].bitmap.height;
      const width = label[overlayField].bitmap.width;
      label[overlayField].image = new ArrayBuffer(height * width * 4);
      label[overlayField].bitmap.close();
      label[overlayField].bitmap = null;
    }

    // nothing to be done
    return;
  }

  // convert absolute file path to a URL that we can "fetch" from
  const overlayImageUrl = getSampleSrc(
    sources[`${field}.${overlayPathField}`] || label[overlayPathField]
  );
  const urlTokens = overlayImageUrl.split("?");

  let baseUrl = overlayImageUrl;

  // remove query params if not local URL
  if (!urlTokens.at(1)?.startsWith("filepath=")) {
    baseUrl = overlayImageUrl.split("?")[0];
  }

  let overlayImageBlob: Blob;
  try {
    const overlayImageFetchResponse = await enqueueFetch({
      url: baseUrl,
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
    overlayMask = await decodeWithCanvas(overlayImageBlob);
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

  // no need to transfer image's buffer
  //since we'll be constructing ImageBitmap and transfering that
  maskTargetsBuffers.push(overlayMask.buffer);
};
