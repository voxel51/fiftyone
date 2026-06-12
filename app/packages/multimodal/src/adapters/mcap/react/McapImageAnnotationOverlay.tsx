import { useSetTileSelection } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useState } from "react";

import {
  ImageAnnotationsOverlay,
  type ImageAnnotationPickedPrimitive,
} from "../../../visualization/panels/ImageAnnotationsOverlay";
import { useInterpolatedImageAnnotations } from "./use-interpolated-image-annotations";

export interface McapImageAnnotationOverlayProps {
  readonly topic: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit?: "contain" | "cover";
  readonly interpolate?: boolean;
}

/**
 * Subscribes to one MCAP image-annotations topic and overlays its decoded
 * primitives on top of the surrounding image panel. Mounting subscribes;
 * unmounting drops the subscription, so the image tile's settings toggle
 * is just a render gate.
 */
const McapImageAnnotationOverlay: React.FC<McapImageAnnotationOverlayProps> = ({
  topic,
  imageWidth,
  imageHeight,
  fit = "contain",
  interpolate = true,
}) => {
  const frame = useInterpolatedImageAnnotations(topic, { interpolate });
  const setSelection = useSetTileSelection();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKey(null);
  }, [topic]);

  const handleSelect = useCallback(
    (picked: ImageAnnotationPickedPrimitive) => {
      setSelectedKey(picked.key);
      setSelection({
        kind: "image-annotation",
        topic,
        primitiveKind: picked.primitive.kind,
        primitiveIndex: picked.primitiveIndex,
        color: picked.color,
        label: picked.label,
        data: picked.primitive.value,
      });
    },
    [setSelection, topic]
  );

  if (!frame) return null;
  return (
    <ImageAnnotationsOverlay
      annotations={[frame]}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      fit={fit}
      selectedKey={selectedKey}
      onSelectPrimitive={handleSelect}
    />
  );
};

export default McapImageAnnotationOverlay;
