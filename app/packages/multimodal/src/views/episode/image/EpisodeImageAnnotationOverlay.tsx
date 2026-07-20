import { useSetTileSelection } from "@fiftyone/tiling";
import { useSetAtom } from "jotai";
import React, { useCallback, useMemo } from "react";

import {
  ImageAnnotationsOverlay,
  type ImageAnnotationPickedPrimitive,
} from "../../../visualization/panels/ImageAnnotationsOverlay";
import type { ImageViewTransform } from "../../../visualization/panels/base-2d-scene";
import {
  episodeSelectedObjectAtom,
  useEpisodeSelectedObject,
} from "../scene/episode-selected-object";
import { useInterpolatedImageAnnotationSets } from "./use-interpolated-image-annotations";

export interface EpisodeImageAnnotationOverlayProps {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly fit?: "contain" | "cover";
  readonly interpolate?: boolean;
  readonly pixelTransform?: (
    u: number,
    v: number,
  ) => readonly [number, number] | null;
  readonly streams: readonly string[];
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Subscribes to selected episode image-annotations streams and overlays their
 * decoded primitives on top of the surrounding image panel.
 *
 * Selection is shared modal-wide through `episodeSelectedObjectAtom`: the
 * exact picked shape highlights wherever its stream renders, other tiles
 * echo by label, and the inspector sidebar shows the payload. The
 * per-tile selection is still published for the tiling inspector
 * contract.
 */
const EpisodeImageAnnotationOverlay: React.FC<
  EpisodeImageAnnotationOverlayProps
> = ({
  imageWidth,
  imageHeight,
  fit = "contain",
  interpolate = true,
  pixelTransform,
  streams,
  viewTransform,
}) => {
  const annotationSets = useInterpolatedImageAnnotationSets(streams, {
    interpolate,
  });
  const setSelection = useSetTileSelection();
  const selectedObject = useEpisodeSelectedObject();
  const setSelectedObject = useSetAtom(episodeSelectedObjectAtom);

  const displayedStreams = useMemo(
    () => new Set(annotationSets.map((set) => set.stream)),
    [annotationSets],
  );
  // Exact-shape highlight when the modal-wide selection points at one of
  // this overlay's streams; the label echo only widens SHIFT-click
  // (label-scoped) selections.
  const selectedKey =
    selectedObject?.kind === "image-annotation" &&
    displayedStreams.has(selectedObject.stream)
      ? selectedObject.key
      : null;
  const highlightLabel =
    selectedObject?.scope === "label" ? selectedObject.label : null;

  const handleSelect = useCallback(
    (
      picked: ImageAnnotationPickedPrimitive,
      modifiers: { readonly shiftKey: boolean },
    ) => {
      const stream = annotationSets[picked.setIndex]?.stream;
      if (!stream) return;
      // Plain click = this shape only; shift-click widens to the label.
      // Re-clicking with the same scope toggles off.
      const scope = modifiers.shiftKey
        ? ("label" as const)
        : ("instance" as const);
      const isRepeat =
        selectedObject?.kind === "image-annotation" &&
        selectedObject.stream === stream &&
        selectedObject.key === picked.key &&
        selectedObject.scope === scope;
      if (isRepeat) {
        setSelectedObject(null);
        setSelection(null);
        return;
      }
      const payload = {
        kind: "image-annotation" as const,
        scope,
        stream,
        key: picked.key,
        label: picked.label,
        primitiveKind: picked.primitive.kind,
        primitiveIndex: picked.primitiveIndex,
        data: picked.primitive.value,
      };
      setSelectedObject(payload);
      setSelection({ ...payload, color: picked.color });
    },
    [annotationSets, selectedObject, setSelection, setSelectedObject],
  );

  if (annotationSets.length === 0) return null;
  return (
    <ImageAnnotationsOverlay
      annotations={annotationSets.map((set) => set.frame)}
      renderMetadata={annotationSets.map((set) => set.renderMetadata)}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      fit={fit}
      selectedKey={selectedKey}
      highlightLabel={highlightLabel}
      onSelectPrimitive={handleSelect}
      pixelTransform={pixelTransform}
      viewTransform={viewTransform}
    />
  );
};

export default EpisodeImageAnnotationOverlay;
