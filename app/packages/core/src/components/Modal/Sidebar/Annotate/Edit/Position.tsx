import {
  BoundingBoxOverlay,
  LIGHTER_EVENTS,
  TransformOverlayCommand,
  useLighter,
} from "@fiftyone/lighter";
import { useAtom, useAtomValue } from "jotai";
import { debounce } from "lodash";
import React, { useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { setPathUserUnchanged } from "../../../../../plugins/SchemaIO/hooks";
import { currentData, currentOverlay } from "./state";

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
    const handler = (event) => {
      if (
        !(overlay instanceof BoundingBoxOverlay) ||
        !overlay.hasValidBounds() ||
        event.detail.id !== data?._id
      ) {
        return;
      }
      const absolute = overlay.getAbsoluteBounds();
      const relative = overlay.getRelativeBounds();

      setState({
        position: { x: absolute.x, y: absolute.y },
        dimensions: { width: absolute.width, height: absolute.height },
      });

      setData({
        bounding_box: [relative.x, relative.y, relative.width, relative.height],
      });

      // Clear user changed flags so inputs update from overlay changes
      setPathUserUnchanged("position.x");
      setPathUserUnchanged("position.y");
      setPathUserUnchanged("dimensions.width");
      setPathUserUnchanged("dimensions.height");
    };

    scene?.on(LIGHTER_EVENTS.OVERLAY_BOUNDS_CHANGED, handler);
    scene?.on(LIGHTER_EVENTS.OVERLAY_DRAG_MOVE, handler);
    scene?.on(LIGHTER_EVENTS.OVERLAY_RESIZE_MOVE, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_BOUNDS_CHANGED, handler);
      scene?.off(LIGHTER_EVENTS.OVERLAY_DRAG_MOVE, handler);
      scene?.off(LIGHTER_EVENTS.OVERLAY_RESIZE_MOVE, handler);
    };
  }, [data?._id, overlay, scene, setData]);

  const debouncedEvent = useMemo(
    () =>
      debounce((data: Coordinates) => {
        if (
          !(overlay instanceof BoundingBoxOverlay) ||
          !overlay.hasValidBounds() ||
          !scene
        ) {
          return;
        }

        // Check if data actually differs from current overlay bounds
        const currentBounds = overlay.getAbsoluteBounds();
        const hasChanged =
          data.position.x !== currentBounds.x ||
          data.position.y !== currentBounds.y ||
          data.dimensions.width !== currentBounds.width ||
          data.dimensions.height !== currentBounds.height;

        if (!hasChanged) {
          return;
        }

        // if debounced and `hasChanged` we can trust that we're dealing with user input
        const rect = overlay.getAbsoluteBounds();
        scene.executeCommand(
          new TransformOverlayCommand(
            overlay,
            overlay.id,
            overlay.getAbsoluteBounds(),
            {
              ...rect,
              ...data.position,
              ...data.dimensions,
            }
          )
        );
      }, 300),
    [overlay, scene]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedEvent.cancel();
    };
  }, [debouncedEvent]);

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
        onChange={debouncedEvent}
      />
    </div>
  );
}
