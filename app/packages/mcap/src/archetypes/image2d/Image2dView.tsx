import { TexturedImageView } from "@fiftyone/playback/experimental/views/TexturedImageView";
import React from "react";
import type { Image2dViewProps } from "./types";

/** Pure visual image surface for render-ready 2D frames. */
export function Image2dView({
  alt = "",
  frame,
  objectFit = "contain",
}: Image2dViewProps) {
  if (!frame) {
    return null;
  }

  return (
    <TexturedImageView
      alt={alt}
      objectFit={objectFit}
      src={frame.src}
      testId="image2d-view"
    />
  );
}
