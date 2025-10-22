import {
  BoundingBoxOverlay,
  LIGHTER_EVENTS,
  useLighter,
} from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { currentOverlay } from "./state";

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

  const { scene } = useLighter();

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

  useEffect(() => {
    const handler = () => {
      if (
        !(overlay instanceof BoundingBoxOverlay) ||
        !overlay.hasValidBounds()
      ) {
        return;
      }
      const rect = overlay.getAbsoluteBounds();
      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_DRAG_MOVE, handler);
    scene?.on(LIGHTER_EVENTS.OVERLAY_RESIZE_MOVE, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_DRAG_MOVE, handler);
      scene?.off(LIGHTER_EVENTS.OVERLAY_RESIZE_MOVE, handler);
    };
  }, [overlay, scene]);

  return (
    <div style={{ width: "100%" }}>
      <SchemaIOComponent
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

          const rect = overlay.getAbsoluteBounds();
          overlay.setAbsoluteBounds({
            ...rect,
            ...data.dimensions,
            ...data.position,
          });
        }}
      />
    </div>
  );
}
