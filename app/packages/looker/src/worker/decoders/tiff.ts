import * as tiff from "geotiff";
import type { OverlayMask } from "./types";

export default async (blob: Blob) => {
  const r = await tiff.fromBlob(blob);
  const image = await r.getImage();

  try {
    const data = await image.readRGB({});
    console.log(data);
    if (!(data instanceof Uint8Array)) {
      throw new Error("wrong");
    }

    return {
      arrayType: "Uint8Array",
      buffer: data.buffer,
      shape: [3, 4],
      channels: 2,
    } as OverlayMask;
  } catch (e) {
    console.error(e);
  }
};
