import { VISUALIZATION_KIND } from "../../visualization";
import type { McapGridPreviewFrame } from "./grid-preview";

export function imageFrame(
  frame: McapGridPreviewFrame | null,
): Extract<McapGridPreviewFrame, { kind: "image" }> | null {
  return frame?.kind === "image" ? frame : null;
}

export function firstImageByte(
  frame: McapGridPreviewFrame | null,
): number | undefined {
  const image = imageFrame(frame)?.image;
  return image?.kind === VISUALIZATION_KIND.ENCODED_IMAGE
    ? image.bytes[0]
    : undefined;
}
