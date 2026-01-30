import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { currentData, currentOverlay } from "./state";
import { useAtom, useAtomValue } from "jotai";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";

const createInput = (name: string, readOnly?: boolean) => {
  return {
    [name]: {
      type: "number",
      view: {
        name: "View",
        label: name,
        component: "FieldView",
        readOnly,
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

  const schema: SchemaType = useMemo(
    () => ({
      type: "object",
      view: {
        component: "ObjectView",
      },
      properties: {
        position: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("x", readOnly),
            ...createInput("y", readOnly),
          },
        },
        dimensions: {
          type: "object",
          view: createStack(),
          properties: {
            ...createInput("width", readOnly),
            ...createInput("height", readOnly),
          },
        },
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
