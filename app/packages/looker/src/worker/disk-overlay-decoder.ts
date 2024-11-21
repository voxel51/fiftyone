import { getSampleSrc } from "@fiftyone/state";
import { DETECTION, DETECTIONS, HEATMAP } from "@fiftyone/utilities";
import { Coloring, CustomizeColor } from "..";
import { Colorscale } from "../state";
import { decodeWithCanvas } from "./canvas-decoder";
import { fetchWithLinearBackoff } from "./decorated-fetch";

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
  maskPathDecodingPromises: Promise<void>[] = []
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
          DETECTION
        )
      );
    }
    maskPathDecodingPromises.push(...promises);
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
  const urlTokens = overlayImageUrl.split("?");

  let baseUrl = overlayImageUrl;

  // remove query params if not local URL
  if (!urlTokens.at(1)?.startsWith("filepath=")) {
    baseUrl = overlayImageUrl.split("?")[0];
  }

  let overlayImageBlob: Blob;
  try {
    const overlayImageFetchResponse = await fetchWithLinearBackoff(baseUrl);
    overlayImageBlob = await overlayImageFetchResponse.blob();
  } catch (e) {
    console.error(e);
    // skip decoding if fetch fails altogether
    return;
  }

  const overlayMask = await decodeWithCanvas(overlayImageBlob);
  const [overlayHeight, overlayWidth] = overlayMask.shape;

  // set the `mask` property for this label
  // we need to do this because we need raw image pixel data
  // to iterate through and paint it with the color
  // defined by the user for this particular label
  label[overlayField] = {
    data: overlayMask,
    image: new ArrayBuffer(overlayWidth * overlayHeight * 4),
  };
};
