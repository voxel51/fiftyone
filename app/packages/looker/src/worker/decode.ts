import { getFetchFunction } from "@fiftyone/utilities";
import { decode as decodeTiff } from "decode-tiff";
import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import type { OverlayMask } from "../numpy";
import { indexedPngBufferToRgb } from "./indexed-png-decoder";

type Decoder = (buffer: ArrayBuffer) => OverlayMask;

const jpeg = (buffer: ArrayBuffer): OverlayMask => {
  const { data, height, width } = decodeJpeg(buffer, { useTArray: true });

  return {
    arrayType: data.constructor.name as OverlayMask["arrayType"],
    buffer: data.buffer,
    channels: data.length / (width * height),
    shape: [height, width],
  };
};

const png = (buffer: ArrayBuffer): OverlayMask => {
  const {
    channels: channelsResult,
    data: dataResult,
    depth,
    height,
    palette,
    width,
  } = decodePng(buffer);

  let channels = channelsResult;
  let data = dataResult;
  if (palette?.length) {
    data = indexedPngBufferToRgb(dataResult, depth, palette);
    channels = 3;
  }

  return {
    arrayType: data.constructor.name as OverlayMask["arrayType"],
    buffer: data.buffer,
    channels,
    shape: [height, width],
  };
};

const tiff = (buffer: ArrayBuffer): OverlayMask => {
  const result = decodeTiff(buffer);
  console.log(result);
  throw new Error("todo");
};

const IMAGE_DECODERS: { [key: string]: Decoder } = {
  jpeg,
  jpg: jpeg,
  png,
  tif: tiff,
  tiff,
};

export default async function decode(url: string) {
  const buffer: ArrayBuffer = await getFetchFunction()(
    "GET",
    url,
    null,
    "arrayBuffer"
  );

  const extension = url.split(".").slice(-1)[0];
  return IMAGE_DECODERS[extension](buffer);
}
