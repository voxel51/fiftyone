import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import {
  imagePixelsToCanvasPixels,
  relativeToImagePixels,
} from "./coordinateConversion";
import { createWHGroupSchema, createXYGroupSchema } from "./positionSchema";
import { currentData, currentOverlay } from "./state";

interface Coordinates {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
}

export interface PositionProps {
  readOnly?: boolean;
}

export default function Position({ readOnly = false }: PositionProps) {
  const [state, setState] = useState<Coordinates>({
    position: {},
    dimensions: {},
  });

  const overlay = useAtomValue(currentOverlay);
  const [data, setData] = useAtom(currentData);

  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const toImagePixels = useCallback(
    (relative: Parameters<typeof relativeToImagePixels>[0]) => {
      const dims = scene?.getCanonicalMedia()?.getOriginalDimensions() ?? {
        width: 1,
        height: 1,
      };
      return relativeToImagePixels(relative, dims);
    },
    [scene]
  );

  const toCanvasPixels = useCallback(
    (imageRect: Parameters<typeof imagePixelsToCanvasPixels>[0]) => {
      const canonicalMedia = scene?.getCanonicalMedia();
      const dims = canonicalMedia?.getOriginalDimensions() ?? {
        width: 1,
        height: 1,
      };
      const rendered = canonicalMedia?.getRenderedBounds() ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      };
      return imagePixelsToCanvasPixels(imageRect, dims, rendered);
    },
    [scene]
  );

  useEffect(() => {
    if (!(overlay instanceof BoundingBoxOverlay) || !overlay.hasValidBounds()) {
      return;
    }

    const rect = toImagePixels(overlay.relativeBounds);

    setState({
      position: { x: rect.x, y: rect.y },
      dimensions: { width: rect.width, height: rect.height },
    });
  }, [overlay, toImagePixels]);

  const handleBoundsChange = useCallback(
    (payload: { id: string }) => {
      if (
        !(overlay instanceof BoundingBoxOverlay) ||
        !overlay.hasValidBounds() ||
        payload.id !== data?._id
      ) {
        return;
      }

      const rect = toImagePixels(overlay.relativeBounds);

      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });

      const relative = overlay.relativeBounds;
      setData({
        bounding_box: [relative.x, relative.y, relative.width, relative.height],
      });
    },
    [data?._id, overlay, toImagePixels, setData]
  );

  useEventHandler("lighter:overlay-bounds-changed", handleBoundsChange);
  useEventHandler("lighter:overlay-drag-move", handleBoundsChange);
  useEventHandler("lighter:overlay-resize-move", handleBoundsChange);

  const schema: SchemaType = useMemo(
    () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        position: createXYGroupSchema(readOnly),
        dimensions: createWHGroupSchema(readOnly),
      },
    }),
    [readOnly]
  );

  return (
    <div style={{ width: "100%" }}>
      <SchemaIOComponent
        key={overlay?.id}
        smartForm={true}
        schema={schema}
        data={state}
        onChange={(data: Coordinates) => {
          if (
            readOnly ||
            !(overlay instanceof BoundingBoxOverlay) ||
            !overlay.hasValidBounds()
          ) {
            return;
          }

          const oldBounds = overlay.bounds;
          const currentImagePixels = toImagePixels(overlay.relativeBounds);
          const newImagePixels = {
            ...currentImagePixels,
            ...data.dimensions,
            ...data.position,
          };
          const newCanvasBounds = toCanvasPixels(newImagePixels);
          scene?.executeCommand(
            new TransformOverlayCommand(
              overlay,
              overlay.id,
              oldBounds,
              newCanvasBounds
            )
          );
        }}
      />
    </div>
  );
}
