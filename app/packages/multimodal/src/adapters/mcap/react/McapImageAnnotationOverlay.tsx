import { useSetTileSelection } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useState } from "react";

import {
  ImageAnnotationsOverlay,
  type ImageAnnotationPickedPrimitive,
} from "../../../visualization/panels/ImageAnnotationsOverlay";
import type { ImageViewTransform } from "../../../visualization/panels/base-2d-scene";
import { useInterpolatedImageAnnotationSets } from "./use-interpolated-image-annotations";

export interface McapImageAnnotationOverlayProps {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit?: "contain" | "cover";
  readonly interpolate?: boolean;
  readonly topics: readonly string[];
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Subscribes to selected MCAP image-annotations topics and overlays their
 * decoded primitives on top of the surrounding image panel.
 */
const McapImageAnnotationOverlay: React.FC<McapImageAnnotationOverlayProps> = ({
  imageWidth,
  imageHeight,
  fit = "contain",
  interpolate = true,
  topics,
  viewTransform,
}) => {
  const annotationSets = useInterpolatedImageAnnotationSets(topics, {
    interpolate,
  });
  const setSelection = useSetTileSelection();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const topicKey = topics.join("\0");

  // This effect clears the selected primitive when annotation topics change.
  useEffect(() => {
    setSelectedKey(null);
  }, [topicKey]);

  const handleSelect = useCallback(
    (picked: ImageAnnotationPickedPrimitive) => {
      const topic = annotationSets[picked.setIndex]?.topic;
      if (!topic) return;
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
    [annotationSets, setSelection],
  );

  if (annotationSets.length === 0) return null;
  return (
    <ImageAnnotationsOverlay
      annotations={annotationSets.map((set) => set.frame)}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      fit={fit}
      selectedKey={selectedKey}
      onSelectPrimitive={handleSelect}
      viewTransform={viewTransform}
    />
  );
};

export default McapImageAnnotationOverlay;
