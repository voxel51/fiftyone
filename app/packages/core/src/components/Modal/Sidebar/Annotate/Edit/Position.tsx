import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import React, { useCallback, useEffect, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { currentData, currentOverlay } from "./state";
import { useAtom, useAtomValue } from "jotai";

const createInput = (name: string) => {
  return {
    [name]: {
      type: "number",
      view: {
        name: "View",
        label: name,
        component: "FieldView",
      },
      multipleOf: 0.01,
    },
  };
};

const createStack = () => {
  return {
    name: "HStackView",
    component: "GridView",
    orientation: "horizontal",
    gap: 1,
    align_x: "left",
    align_y: "top",
  };
};

interface Coordinates {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
}

export default function Position() {
  const [state, setState] = useState<Coordinates>({
    position: {},
    dimensions: {},
  });

  const overlay = useAtomValue(currentOverlay);
  const [data, setData] = useAtom(currentData);

  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getSceneId() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  useEffect(() => {
    if (!(overlay instanceof BoundingBoxOverlay) || !overlay.hasValidBounds()) {
      return;
    }

    const rect = overlay.getAbsoluteBounds();

    setState({
      position: { x: rect.x, y: rect.y },
      dimensions: { width: rect.width, height: rect.height },
    });
  }, [overlay]);

  const handleBoundsChange = useCallback(
    (payload: { id: string }) => {
      if (
        !(overlay instanceof BoundingBoxOverlay) ||
        !overlay.hasValidBounds() ||
        payload.id !== data?._id
      ) {
        return;
      }
      const rect = overlay.getAbsoluteBounds();

      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });

      const relative = overlay.getRelativeBounds();
      setData({
        bounding_box: [relative.x, relative.y, relative.width, relative.height],
      });
    },
    [data?._id, overlay, setData]
  );

  useEventHandler("lighter:overlay-bounds-changed", handleBoundsChange);
  useEventHandler("lighter:overlay-drag-move", handleBoundsChange);
  useEventHandler("lighter:overlay-resize-move", handleBoundsChange);

  return (
    <div style={{ width: "100%" }}>
      <SchemaIOComponent
        key={overlay?.id}
        smartForm={true}
        schema={{
          type: "object",
          view: {
            component: "ObjectView",
          },
          properties: {
            position: {
              type: "object",
              view: createStack(),
              properties: {
                ...createInput("x"),
                ...createInput("y"),
              },
            },
            dimensions: {
              type: "object",
              view: createStack(),
              properties: {
                ...createInput("width"),
                ...createInput("height"),
              },
            },
          },
        }}
        data={state}
        onChange={(data: Coordinates) => {
          if (
            !(overlay instanceof BoundingBoxOverlay) ||
            !overlay.hasValidBounds()
          ) {
            return;
          }

          const oldBounds = overlay.getAbsoluteBounds();
          scene?.executeCommand(
            new TransformOverlayCommand(overlay, overlay.id, oldBounds, {
              ...oldBounds,
              ...data.dimensions,
              ...data.position,
            })
          );
        }}
      />
    </div>
  );
}
