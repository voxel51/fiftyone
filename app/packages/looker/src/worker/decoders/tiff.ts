import { getFetchFunction } from "@fiftyone/utilities";
import { decode } from "decode-tiff";
import type { OverlayMask } from "../../numpy";

export default async (url: string) => {
  const buffer: ArrayBuffer = await getFetchFunction()(
    "GET",
    url,
    null,
    "arrayBuffer"
  );
  const result = decode(buffer);
  return {} as OverlayMask;
};
