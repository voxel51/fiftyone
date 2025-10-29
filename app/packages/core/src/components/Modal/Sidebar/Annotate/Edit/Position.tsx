import {
  BoundingBoxOverlay,
  LIGHTER_EVENTS,
  Rect,
  TransformOverlayCommand,
  useLighter,
} from "@fiftyone/lighter";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { currentData, currentOverlay } from "./state";
import { Box, Stack, TextField } from "@mui/material";
import { LabeledField } from "@fiftyone/components";

interface Coordinates {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
}

const hasValidBounds = (coordinates: Coordinates): boolean => {
  return [
    coordinates.position.x,
    coordinates.position.y,
    coordinates.dimensions.width,
    coordinates.dimensions.height,
  ].reduce((prev, current) => prev && !Number.isNaN(current), true);
};

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

  const handleUserInputChange = (coordinateDelta: Partial<Coordinates>) => {
    // synchronize internal state
    const newState = {
      position: {
        ...state.position,
        ...coordinateDelta.position,
      },
      dimensions: {
        ...state.dimensions,
        ...coordinateDelta.dimensions,
      },
    };
    setState(newState);

    if (
      !(overlay instanceof BoundingBoxOverlay) ||
      !overlay.hasValidBounds() ||
      !hasValidBounds(newState)
    ) {
      return;
    }

    // update overlay
    scene?.executeCommand(
      new TransformOverlayCommand(
        overlay,
        overlay.id,
        overlay.getAbsoluteBounds(),
        {
          ...state.position,
          ...state.dimensions,
          ...coordinateDelta?.position,
          ...coordinateDelta?.dimensions,
        } as Rect
      )
    );
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ pl: 1, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="x"
          formControl={
            <TextField
              type="number"
              value={state.position.x}
              onChange={(e) => {
                handleUserInputChange({
                  position: { x: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />

        <LabeledField
          label="y"
          formControl={
            <TextField
              type="number"
              value={state.position.y}
              onChange={(e) => {
                handleUserInputChange({
                  position: { y: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ pl: 1, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="width"
          formControl={
            <TextField
              type="number"
              value={state.dimensions.width}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { width: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />

        <LabeledField
          label="height"
          formControl={
            <TextField
              type="number"
              value={state.dimensions.height}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { height: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />
      </Stack>
    </Box>
  );
}
