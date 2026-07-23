import { useSetTileSelection } from "@fiftyone/tiling";
import { useSetAtom } from "jotai";
import type { MutableRefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { GpuImageAnnotationPickerHandle } from "../../../visualization/media-2d/GpuImageAnnotationPicker";
import {
  EMPTY_PREPARED_IMAGE_ANNOTATIONS,
  prepareImageAnnotationHighlight,
  prepareImageAnnotations,
  type ImagePixelTransform,
  type PreparedImageAnnotationMetadata,
  type PreparedImageAnnotations,
} from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import {
  getGpuImageAnnotationResource,
  type GpuImageAnnotationResource,
} from "../../../visualization/media-2d/gpu-image-annotation-resources";
import {
  selectedObjectAtom,
  useSelectedObject,
} from "../interaction/selection/selected-object";
import { useInterpolatedImageAnnotationSets } from "./use-interpolated-image-annotations";

const SHARED_EMPTY_RESOURCE_KEY = "image-annotations\nshared-empty";

/** Prepared scene resources and DOM interaction callbacks for one image tile. */
export interface ImageAnnotationLayerState {
  readonly hasGeometry: boolean;
  readonly highlightResource: GpuImageAnnotationResource;
  readonly pickerRef: MutableRefObject<GpuImageAnnotationPickerHandle | null>;
  readonly prepared: PreparedImageAnnotations;
  readonly resource: GpuImageAnnotationResource;
  readonly selectPrimitive: (primitiveIndex: number, shiftKey: boolean) => void;
  readonly setHoveredPrimitiveIndex: (primitiveIndex: number | null) => void;
}

/**
 * Keeps playback subscriptions and app selection state outside the R3F portal.
 * The scene receives only flat buffers; the DOM overlay receives only metadata
 * and stable imperative handlers.
 */
export function useImageAnnotationLayer({
  pixelTransform,
  resourceKey,
  streams,
}: {
  readonly pixelTransform?: ImagePixelTransform;
  readonly resourceKey: string;
  readonly streams: readonly string[];
}): ImageAnnotationLayerState {
  // Recorded annotations are authoritative. Smooth interpolation intentionally
  // remains disabled for this renderer.
  const annotationSets = useInterpolatedImageAnnotationSets(streams, {
    interpolate: false,
  });
  const prepared = useMemo(
    () => prepareImageAnnotations(annotationSets, pixelTransform),
    [annotationSets, pixelTransform],
  );
  const preparedHasGeometry = hasAnnotationGeometry(prepared);
  const resource = useMemo(
    () =>
      getGpuImageAnnotationResource(
        preparedHasGeometry ? resourceKey : SHARED_EMPTY_RESOURCE_KEY,
        preparedHasGeometry ? prepared : EMPTY_PREPARED_IMAGE_ANNOTATIONS,
      ),
    [prepared, preparedHasGeometry, resourceKey],
  );
  const [hoveredPrimitiveIndex, setHoveredPrimitiveIndex] = useState<
    number | null
  >(null);
  const selectedObject = useSelectedObject();
  const setSelectedObject = useSetAtom(selectedObjectAtom);
  const setTileSelection = useSetTileSelection();
  const highlightIndices = useMemo(() => {
    const indices = new Set<number>();
    if (
      hoveredPrimitiveIndex !== null &&
      prepared.metadata[hoveredPrimitiveIndex]
    ) {
      indices.add(hoveredPrimitiveIndex);
    }
    for (let index = 0; index < prepared.metadata.length; index++) {
      const metadata = prepared.metadata[index];
      const exact =
        selectedObject?.kind === "image-annotation" &&
        selectedObject.stream === metadata.stream &&
        selectedObject.key === metadata.key;
      const labelEcho =
        selectedObject?.scope === "label" &&
        metadata.label !== null &&
        metadata.label === selectedObject.label;
      if (exact || labelEcho) indices.add(index);
    }
    return indices;
  }, [hoveredPrimitiveIndex, prepared.metadata, selectedObject]);
  const highlightPrepared = useMemo(
    () => prepareImageAnnotationHighlight(prepared, highlightIndices),
    [highlightIndices, prepared],
  );
  const highlightHasGeometry = hasAnnotationGeometry(highlightPrepared);
  const highlightResource = useMemo(
    () =>
      getGpuImageAnnotationResource(
        highlightHasGeometry
          ? `${resourceKey}\nhighlight`
          : SHARED_EMPTY_RESOURCE_KEY,
        highlightHasGeometry
          ? highlightPrepared
          : EMPTY_PREPARED_IMAGE_ANNOTATIONS,
      ),
    [highlightHasGeometry, highlightPrepared, resourceKey],
  );
  const pickerRef = useRef<GpuImageAnnotationPickerHandle | null>(null);

  const selectPrimitive = useCallback(
    (primitiveIndex: number, shiftKey: boolean) => {
      const metadata: PreparedImageAnnotationMetadata | undefined =
        prepared.metadata[primitiveIndex];
      if (!metadata) return;
      const scope = shiftKey ? ("label" as const) : ("instance" as const);
      const repeat =
        selectedObject?.kind === "image-annotation" &&
        selectedObject.stream === metadata.stream &&
        selectedObject.key === metadata.key &&
        selectedObject.scope === scope;
      if (repeat) {
        setSelectedObject(null);
        setTileSelection(null);
        return;
      }
      const payload = {
        data: metadata.primitive.value,
        key: metadata.key,
        kind: "image-annotation" as const,
        label: metadata.label,
        primitiveIndex: metadata.primitiveIndex,
        primitiveKind: metadata.primitive.kind,
        scope,
        stream: metadata.stream,
      };
      setSelectedObject(payload);
      setTileSelection({ ...payload, color: metadata.color });
    },
    [prepared.metadata, selectedObject, setSelectedObject, setTileSelection],
  );

  return {
    hasGeometry: preparedHasGeometry,
    highlightResource,
    pickerRef,
    prepared,
    resource,
    selectPrimitive,
    setHoveredPrimitiveIndex,
  };
}

function hasAnnotationGeometry(prepared: PreparedImageAnnotations): boolean {
  return (
    prepared.points.count > 0 ||
    prepared.segments.count > 0 ||
    prepared.picks.count > 0
  );
}
