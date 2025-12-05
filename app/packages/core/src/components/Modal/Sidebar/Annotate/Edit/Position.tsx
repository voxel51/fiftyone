import { LabeledField } from "@fiftyone/components";
import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { Box, Stack, TextField } from "@mui/material";
import { useAtom, useAtomValue } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { currentData, currentOverlay } from "./state";

interface Coordinates {
  position: { x?: number; y?: number };
  dimensions: { width?: number; height?: number };
}

const hasValidBounds = (coordinates: Coordinates): boolean => {
  const { x, y } = coordinates.position;
  const { width, height } = coordinates.dimensions;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    width !== undefined &&
    height !== undefined &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
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

  const handleBoundsChange = useCallback(
    (payload: { id: string }) => {
      if (
        !(overlay instanceof BoundingBoxOverlay) ||
        !overlay.hasValidBounds() ||
        payload.id !== data?._id
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
    },
    [data?._id, overlay, setData]
  );

  useLighterEventHandler("lighter:overlay-bounds-changed", handleBoundsChange);
  useLighterEventHandler("lighter:overlay-drag-move", handleBoundsChange);
  useLighterEventHandler("lighter:overlay-resize-move", handleBoundsChange);

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
    const currentBounds = overlay.getAbsoluteBounds();
    scene?.executeCommand(
      new TransformOverlayCommand(overlay, overlay.id, currentBounds, {
        ...currentBounds,
        ...coordinateDelta?.position,
        ...coordinateDelta?.dimensions,
      })
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
              value={state.position.x ?? ""}
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
              value={state.position.y ?? ""}
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
              value={state.dimensions.width ?? ""}
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
              value={state.dimensions.height ?? ""}
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
