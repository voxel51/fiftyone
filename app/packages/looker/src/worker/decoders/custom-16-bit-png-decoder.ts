import { decode } from "fast-png";
import { OverlayMask } from "../numpy";

export const customDecode16BitPng = async (blob: Blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const decodedPng = decode(arrayBuffer);

  if (decodedPng.palette?.length) {
    // spec doesn't allow palettes for 16-bit PNGs
    throw new Error("Indexed PNGs are not supported for 16-bit PNGs");
  }

  const width = decodedPng.width;
  const height = decodedPng.height;

  const numChannels =
    decodedPng.channels ?? decodedPng.data.length / (width * height);

  return {
    buffer: decodedPng.data.buffer,
    channels: numChannels,
    arrayType: decodedPng.data.constructor.name as OverlayMask["arrayType"],
    shape: [height, width],
  } as OverlayMask;
};
