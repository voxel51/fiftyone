import * as tiff from "geotiff";
import type { OverlayMask } from "./types";

export default async (blob: Blob) => {
  const r = await tiff.fromBlob(blob);
  const image = await r.getImage();
  console.log(image.getHeight(), image.getWidth());
  console.log(r);
  console.log(image);

  console.log();

  const data = await image.readRGB();

  if (!(data instanceof Uint8Array)) {
    throw new Error("wrong");
  }

  return {
    arrayType: "Uint8Array",
    buffer: data.buffer,
    shape: [4, 4],
    channels: 2,
  } as OverlayMask;
};
