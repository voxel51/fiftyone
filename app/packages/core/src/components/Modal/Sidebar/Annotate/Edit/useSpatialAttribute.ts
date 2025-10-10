import { BoundingBoxOverlay, useLighter } from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { current } from "./state";

export default function useSpatialAttribute() {
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
      Position: { X: rect.x, Y: rect.y },
      Dimensions: { Width: rect.width, Height: rect.height },
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
        Position: { X: rect.x, Y: rect.y },
        Dimensions: { Width: rect.width, Height: rect.height },
      });
    });
    scene?.on("overlay-drag-move", (event) => {
      const overlay = scene?.getOverlay(currentLabel.id);
      if (!(overlay instanceof BoundingBoxOverlay)) {
        throw new Error("");
      }
      const rect = overlay.getAbsoluteBounds();
      setState({
        Position: { X: rect.x, Y: rect.y },
        Dimensions: { Width: rect.width, Height: rect.height },
      });
    });
  }, [scene]);

  return {
    data: state ?? initial,
    schema: {
      type: "object",
      view: {
        readOnly: false,

        description: null,
        caption: null,
        space: null,
        placeholder: null,
        read_only: null,
        component: "ObjectView",
        componentsProps: null,
        container: null,
      },
      onChange: null,
      required: false,
      properties: {
        Position: {
          type: "object",
          view: {
            readOnly: false,
            name: "HStackView",
            label: "Position",
            description: null,
            caption: null,
            space: null,
            placeholder: null,
            read_only: null,
            component: "GridView",
            componentsProps: null,
            container: null,
            orientation: "horizontal",
            gap: 1,
            align_x: "left",
            align_y: "top",
          },
          default: null,
          onChange: null,
          required: false,
          properties: {
            X: {
              type: "number",
              view: {
                readOnly: false,
                name: "View",
                label: "X",
                description: null,
                caption: null,
                space: null,
                placeholder: null,
                read_only: null,
                component: "FieldView",
                componentsProps: null,
                container: null,
              },
              default: null,
              onChange: null,
              required: false,
              min: null,
              max: null,
              multipleOf: 0.01,
            },
            Y: {
              type: "number",
              view: {
                readOnly: false,
                name: "View",
                label: "Y",
                description: null,
                caption: null,
                space: null,
                placeholder: null,
                read_only: null,
                component: "FieldView",
                componentsProps: null,
                container: null,
              },
              default: null,
              onChange: null,
              required: false,
              min: null,
              max: null,
              multipleOf: 0.01,
            },
          },
        },
        Dimensions: {
          type: "object",
          view: {
            readOnly: false,
            name: "HStackView",
            label: "Dimensions",
            description: null,
            caption: null,
            space: null,
            placeholder: null,
            read_only: null,
            component: "GridView",
            componentsProps: null,
            container: null,
            orientation: "horizontal",
            gap: 1,
            align_x: "left",
            align_y: "top",
          },
          default: null,
          onChange: null,
          required: false,
          properties: {
            Width: {
              type: "number",
              view: {
                readOnly: false,
                name: "View",
                label: "Width",
                description: null,
                caption: null,
                space: null,
                placeholder: null,
                read_only: null,
                component: "FieldView",
                componentsProps: null,
                container: null,
              },
              default: null,
              onChange: null,
              required: false,
              min: null,
              max: null,
              multipleOf: 0.01,
            },
            Height: {
              type: "number",
              view: {
                readOnly: false,
                name: "View",
                label: "Height",
                description: null,
                caption: null,
                space: null,
                placeholder: null,
                read_only: null,
                component: "FieldView",
                componentsProps: null,
                container: null,
              },
              default: null,
              onChange: null,
              required: false,
              min: null,
              max: null,
              multipleOf: 0.01,
            },
          },
        },
      },
    },
    onChange: (data) => {
      if (!data?.Dimensions?.Width) {
        return;
      }
      const overlay = scene?.getOverlay(currentLabel.id);
      if (!(overlay instanceof BoundingBoxOverlay)) {
        throw new Error("");
      }
      const rect = overlay.getAbsoluteBounds();

      overlay.setAbsoluteBounds({ ...rect, width: data.Dimensions.Width });
    },
  };
}
