<<<<<<< HEAD
import { BoundingBoxOverlay, useLighter } from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { current } from "./state";

export default function Position() {
  return null;
  const [state, setState] = useState(null);
  const currentLabel = useAtomValue(current);

  const { scene } = useLighter();

  const initial = useMemo(() => {
    const overlay = scene?.getOverlay(currentLabel.id);

    if (!(overlay instanceof BoundingBoxOverlay)) {
      throw overlay;
    }
    const rect = overlay.getAbsoluteBounds();
    return {
      position: { x: rect.x, y: rect.y },
      dimensions: { width: rect.width, height: rect.height },
    };
  }, [scene, currentLabel]);

  useEffect(() => {
    scene?.on("overlay-bounds-changed", (event) => {
      const overlay = scene?.getOverlay(currentLabel.id);
      if (!(overlay instanceof BoundingBoxOverlay)) {
        throw new Error("");
=======
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

  const initial = useEffect(() => {
    if (!(overlay instanceof BoundingBoxOverlay)) {
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
      if (!(overlay instanceof BoundingBoxOverlay)) {
        return;
>>>>>>> feat/human-annotation
      }
      const rect = overlay.getAbsoluteBounds();
      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });
<<<<<<< HEAD
    });
    scene?.on("overlay-drag-move", (event) => {
      const overlay = scene?.getOverlay(currentLabel?.data._id);
      if (!(overlay instanceof BoundingBoxOverlay)) {
        throw new Error("");
      }
      const rect = overlay.getAbsoluteBounds();
      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });
    });
  }, [scene]);

  return (
    <div>
=======
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
>>>>>>> feat/human-annotation
      <SchemaIOComponent
        schema={{
          type: "object",
          view: {
            component: "ObjectView",
          },
          properties: {
            position: {
              type: "object",
<<<<<<< HEAD
              view: {
                name: "HStackView",
                component: "GridView",
                orientation: "horizontal",
                gap: 1,
                align_x: "left",
                align_y: "top",
              },
              properties: {
                x: {
                  type: "number",
                  view: {
                    name: "View",
                    label: "x",
                    component: "FieldView",
                  },
                  multipleOf: 0.01,
                },
                y: {
                  type: "number",
                  view: {
                    name: "View",
                    label: "y",
                    component: "FieldView",
                  },
                  multipleOf: 0.01,
                },
=======
              view: createStack(),
              properties: {
                ...createInput("x"),
                ...createInput("y"),
>>>>>>> feat/human-annotation
              },
            },
            dimensions: {
              type: "object",
<<<<<<< HEAD
              view: {
                name: "HStackView",
                component: "GridView",
                orientation: "horizontal",
                gap: 1,
                align_x: "left",
                align_y: "top",
              },
              properties: {
                width: {
                  type: "number",
                  view: {
                    name: "View",
                    label: "width",
                    component: "FieldView",
                  },
                  multipleOf: 0.01,
                },
                height: {
                  type: "number",
                  view: {
                    name: "View",
                    label: "height",
                    component: "FieldView",
                  },
                  multipleOf: 0.01,
                },
=======
              view: createStack(),
              properties: {
                ...createInput("width"),
                ...createInput("height"),
>>>>>>> feat/human-annotation
              },
            },
          },
        }}
        data={state ?? initial}
<<<<<<< HEAD
        onChange={(data) => {
          if (!data?.dimensions?.Width) {
            return;
          }
          const overlay = scene?.getOverlay(currentLabel.id);
          if (!(overlay instanceof BoundingBoxOverlay)) {
            throw new Error("");
          }
          const rect = overlay.getAbsoluteBounds();

          overlay.setAbsoluteBounds({ ...rect, width: data.Dimensions.Width });
=======
        onChange={(data: Coordinates) => {
          if (!(overlay instanceof BoundingBoxOverlay)) {
            return;
          }

          const rect = overlay.getAbsoluteBounds();
          overlay.setAbsoluteBounds({
            ...rect,
            ...data.dimensions,
            ...data.position,
          });
>>>>>>> feat/human-annotation
        }}
      />
    </div>
  );
}
