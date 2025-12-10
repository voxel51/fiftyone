import { LabeledField } from "@fiftyone/components";
import { DetectionLabel } from "@fiftyone/looker";
import {
  isCurrentlyTransformingAtom,
  stagedCuboidTransformsAtom,
  tempLabelTransformsAtom,
} from "@fiftyone/looker-3d/src/state";
import { Box, Stack, TextField } from "@mui/material";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import type { Vector3Tuple } from "three";
import { currentData } from "./state";

interface Coordinates3d {
  position: { x?: number; y?: number; z?: number };
  dimensions: { width?: number; height?: number; depth?: number };
  rotation: { rx?: number; ry?: number; rz?: number };
}

const hasValidBounds = (coordinates: Coordinates3d): boolean => {
  const { x, y, z } = coordinates.position;
  const { width, height, depth } = coordinates.dimensions;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    width !== undefined &&
    height !== undefined &&
    depth !== undefined &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(depth) &&
    width > 0 &&
    height > 0 &&
    depth > 0
  );
};

export default function Position3d() {
  const [state, setState] = useState<Coordinates3d>({
    position: {},
    dimensions: {},
    rotation: {},
  });
  const data = useAtomValue<DetectionLabel>(currentData);
  const setData = useSetAtom(currentData);
  const [stagedCuboidTransforms, setStagedCuboidTransforms] = useRecoilState(
    stagedCuboidTransformsAtom
  );
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);
  const labelId = data?._id ?? "";
  const tempTransforms = useRecoilValue(tempLabelTransformsAtom(labelId));

  useEffect(() => {
    if (!data) {
      return;
    }

    // If currently transforming, use temp transforms if available
    if (isCurrentlyTransforming && tempTransforms) {
      const tempPosition = tempTransforms.position;
      const tempDimensions = tempTransforms.dimensions;
      const rotation = tempTransforms.rotation;

      // If there's temp position (which is relative offset), compute the absolute position
      const absolutePosition = [
        data.location[0] + tempPosition[0],
        data.location[1] + tempPosition[1],
        data.location[2] + tempPosition[2],
      ];

      const fallbackDimensions = data.dimensions;

      setState({
        position: {
          x: absolutePosition[0],
          y: absolutePosition[1],
          z: absolutePosition[2],
        },
        dimensions: tempDimensions
          ? {
              width: tempDimensions[0],
              height: tempDimensions[1],
              depth: tempDimensions[2],
            }
          : fallbackDimensions
          ? {
              width: fallbackDimensions[0],
              height: fallbackDimensions[1],
              depth: fallbackDimensions[2],
            }
          : {},
        rotation: rotation
          ? { rx: rotation[0], ry: rotation[1], rz: rotation[2] }
          : { rx: 0, ry: 0, rz: 0 },
      });
      return;
    }

    const location = data.location;
    const dimensions = data.dimensions;
    const rotation = data.rotation ?? [0, 0, 0];

    if (location && dimensions) {
      setState({
        position: { x: location[0], y: location[1], z: location[2] },
        dimensions: {
          width: dimensions[0],
          height: dimensions[1],
          depth: dimensions[2],
        },
        rotation: { rx: rotation[0], ry: rotation[1], rz: rotation[2] },
      });
    }
  }, [data, isCurrentlyTransforming, tempTransforms, stagedCuboidTransforms]);

  const handleUserInputChange = useCallback(
    (coordinateDelta: Partial<Coordinates3d>) => {
      if (!data?._id) {
        return;
      }

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
        rotation: {
          ...state.rotation,
          ...coordinateDelta.rotation,
        },
      };
      setState(newState);

      if (!hasValidBounds(newState)) {
        return;
      }

      // Update staged transforms
      const newLocation: Vector3Tuple = [
        newState.position.x ?? 0,
        newState.position.y ?? 0,
        newState.position.z ?? 0,
      ];
      const newDimensions: Vector3Tuple = [
        newState.dimensions.width ?? 0,
        newState.dimensions.height ?? 0,
        newState.dimensions.depth ?? 0,
      ];
      const newRotation: Vector3Tuple = [
        newState.rotation.rx ?? 0,
        newState.rotation.ry ?? 0,
        newState.rotation.rz ?? 0,
      ];

      setStagedCuboidTransforms((prev) => ({
        ...prev,
        [data._id]: {
          ...prev[data._id],
          location: newLocation,
          dimensions: newDimensions,
          rotation: newRotation,
        },
      }));

      // Update label data
      setData({
        location: newLocation,
        dimensions: newDimensions,
        rotation: newRotation,
      });
    },
    [data?._id, state, setData, setStagedCuboidTransforms]
  );

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

        <LabeledField
          label="z"
          formControl={
            <TextField
              type="number"
              value={state.position.z ?? ""}
              onChange={(e) => {
                handleUserInputChange({
                  position: { z: parseFloat(e.target.value) },
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

        <LabeledField
          label="depth"
          formControl={
            <TextField
              type="number"
              value={state.dimensions.depth ?? ""}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { depth: parseFloat(e.target.value) },
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
          label="rx"
          formControl={
            <TextField
              type="number"
              value={state.rotation.rx ?? ""}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rx: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />

        <LabeledField
          label="ry"
          formControl={
            <TextField
              type="number"
              value={state.rotation.ry ?? ""}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { ry: parseFloat(e.target.value) },
                });
              }}
              size="small"
            />
          }
        />

        <LabeledField
          label="rz"
          formControl={
            <TextField
              type="number"
              value={state.rotation.rz ?? ""}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rz: parseFloat(e.target.value) },
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
