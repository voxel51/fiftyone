import React from "react";

import type { ImageAnnotationsVisualization } from "../../../decoders";
import { ImageAnnotationsOverlay } from "../../../visualization/panels/ImageAnnotationsOverlay";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

export interface McapCameraAnnotationOverlayProps {
  readonly topic: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit?: "contain" | "cover";
}

/**
 * Subscribes to one MCAP image-annotations topic and overlays its decoded
 * primitives on top of the surrounding image panel. Mounting subscribes;
 * unmounting drops the subscription, so the camera tile's settings toggle
 * is just a render gate.
 */
const McapCameraAnnotationOverlay: React.FC<
  McapCameraAnnotationOverlayProps
> = ({ topic, imageWidth, imageHeight, fit = "contain" }) => {
  const frame = useMcapTopicStream<ImageAnnotationsVisualization>(topic);
  if (!frame) return null;
  return (
    <ImageAnnotationsOverlay
      annotations={[frame]}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      fit={fit}
    />
  );
};

export default McapCameraAnnotationOverlay;
