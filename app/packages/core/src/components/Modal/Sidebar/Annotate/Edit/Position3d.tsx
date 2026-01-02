import { useAnnotationEventBus } from "@fiftyone/annotation";
import { LabeledField } from "@fiftyone/components";
import { DetectionLabel } from "@fiftyone/looker";
import { formatDegrees } from "@fiftyone/looker-3d/src/annotation/utils/rotation-utils";
import {
  isCurrentlyTransformingAtom,
  stagedCuboidTransformsAtom,
  tempLabelTransformsAtom,
} from "@fiftyone/looker-3d/src/state";
import {
  quaternionToRadians,
  radiansToQuaternion,
} from "@fiftyone/looker-3d/src/utils";
import { Box, Stack, TextField } from "@mui/material";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { Quaternion, Vector3Tuple } from "three";
import { currentData, currentOverlay } from "./state";

interface Coordinates3d {
  position: { x?: number; y?: number; z?: number };
  dimensions: { lx?: number; ly?: number; lz?: number };
  rotation: { rx?: number; ry?: number; rz?: number };
}

/**
 * Formats a number to a maximum of 2 decimal places.
 * Returns empty string for undefined or non-finite values.
 */
const formatValue = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(2);
};

const hasValidBounds = (coordinates: Coordinates3d): boolean => {
  const { x, y, z } = coordinates.position;
  const { lx, ly, lz } = coordinates.dimensions;
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    lx !== undefined &&
    ly !== undefined &&
    lz !== undefined &&
    Number.isFinite(lx) &&
    Number.isFinite(ly) &&
    Number.isFinite(lz)
  );
};

export default function Position3d() {
  const [state, setState] = useState<Coordinates3d>({
    position: {},
    dimensions: {},
    rotation: {},
  });
  const data = useAtomValue<DetectionLabel>(currentData);
  const overlay = useAtomValue(currentOverlay);
  const eventBus = useAnnotationEventBus();
  const stagedCuboidTransforms = useRecoilValue(stagedCuboidTransformsAtom);
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);
  const labelId = data?._id ?? "";
  const tempTransforms = useRecoilValue(tempLabelTransformsAtom(labelId));

  useEffect(() => {
    if (typeof stagedCuboidTransforms[labelId]?.dimensions === "undefined") {
      return;
    }

    // Resolve final quaterninon by combining the temp quaternion with the original quaternion
    // console.log(">>>stagedCuboidTransforms[data._id]?.quaternion", stagedCuboidTransforms[data._id]?.quaternion);
    const stagedQuat = new Quaternion(
      ...(Array.isArray(stagedCuboidTransforms[labelId]?.quaternion)
        ? stagedCuboidTransforms[labelId]?.quaternion
        : [0, 0, 0, 1])
    );

    // If currently transforming, use temp transforms if available
    if (isCurrentlyTransforming && tempTransforms) {
      const tempPosition = tempTransforms.position;
      const tempDimensions = tempTransforms.dimensions;
      const tempQuaternion = tempTransforms.quaternion;

      const finalQuat = (
        tempQuaternion ? new Quaternion(...tempQuaternion) : stagedQuat
      ).toArray();

      const fallbackDimensions = data.dimensions;

      // Convert quaternion to radians for display
      const rotationRadians = finalQuat ? quaternionToRadians(finalQuat) : null;

      setState({
        position: {
          x: tempPosition[0],
          y: tempPosition[1],
          z: tempPosition[2],
        },
        dimensions: tempDimensions
          ? {
              lx: tempDimensions[0],
              ly: tempDimensions[1],
              lz: tempDimensions[2],
            }
          : fallbackDimensions
          ? {
              lx: fallbackDimensions[0],
              ly: fallbackDimensions[1],
              lz: fallbackDimensions[2],
            }
          : {},
        rotation: rotationRadians
          ? {
              rx: rotationRadians[0],
              ry: rotationRadians[1],
              rz: rotationRadians[2],
            }
          : { rx: 0, ry: 0, rz: 0 },
      });
      return;
    }

    const location = data.location;
    const dimensions = data.dimensions;
    const rotation = data.rotation;

    if (location && dimensions) {
      setState({
        position: { x: location[0], y: location[1], z: location[2] },
        dimensions: {
          lx: dimensions[0],
          ly: dimensions[1],
          lz: dimensions[2],
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
        newState.dimensions.lx ?? 0,
        newState.dimensions.ly ?? 0,
        newState.dimensions.lz ?? 0,
      ];
      const newRotation: Vector3Tuple = [
        newState.rotation.rx ?? 0,
        newState.rotation.ry ?? 0,
        newState.rotation.rz ?? 0,
      ];

      const newQuaternion = newRotation
        ? radiansToQuaternion(newRotation)
        : null;

      // Emit event for 3D annotation sync
      if (overlay?.id) {
        eventBus.dispatch("annotation:sidebarValueUpdated", {
          overlayId: overlay.id,
          currentLabel: overlay.label as DetectionLabel,
          value: {
            ...data,
            _id: data._id,
            location: newLocation,
            dimensions: newDimensions,
            quaternion: newQuaternion,
            rotation: newRotation,
          },
        });
      }
    },
    [data, state, overlay, eventBus]
  );

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="x"
          formControl={
            <TextField
              type="number"
              value={formatValue(state.position.x)}
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
              value={formatValue(state.position.y)}
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
              value={formatValue(state.position.z)}
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
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label="lx"
          formControl={
            <TextField
              type="number"
              value={formatValue(state.dimensions.lx)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
            />
          }
        />

        <LabeledField
          label="ly"
          formControl={
            <TextField
              type="number"
              value={formatValue(state.dimensions.ly)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { ly: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
            />
          }
        />

        <LabeledField
          label="lz"
          formControl={
            <TextField
              type="number"
              value={formatValue(state.dimensions.lz)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
            />
          }
        />
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.25}
        sx={{ pl: 0, pt: 1, mb: 1 }}
      >
        <LabeledField
          label={`rx (${formatDegrees(state.rotation.rx)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(state.rotation.rx)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
            />
          }
        />

        <LabeledField
          label={`ry (${formatDegrees(state.rotation.ry)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(state.rotation.ry)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { ry: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
            />
          }
        />

        <LabeledField
          label={`rz (${formatDegrees(state.rotation.rz)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(state.rotation.rz)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
            />
          }
        />
      </Stack>
    </Box>
  );
}
