import { BoundingBoxOverlay, useLighter } from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { current } from "./state";

export default function Position() {
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
      }
      const rect = overlay.getAbsoluteBounds();
      setState({
        position: { x: rect.x, y: rect.y },
        dimensions: { width: rect.width, height: rect.height },
      });
    });
    scene?.on("overlay-drag-move", (event) => {
      const overlay = scene?.getOverlay(currentLabel.id);
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
      <SchemaIOComponent
        schema={{
          type: "object",
          view: {
            component: "ObjectView",
          },
          properties: {
            position: {
              type: "object",
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
              },
            },
            dimensions: {
              type: "object",
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
              },
            },
          },
        }}
        data={state ?? initial}
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
        }}
      />
    </div>
  );
}
