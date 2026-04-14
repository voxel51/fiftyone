import React from "react";
import type { Image2dViewProps } from "./types";

const IMAGE_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
};

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
    <img
      alt={alt}
      data-testid="image2d-view"
      src={frame.src}
      style={{
        ...IMAGE_STYLES,
        objectFit,
      }}
    />
  );
}
