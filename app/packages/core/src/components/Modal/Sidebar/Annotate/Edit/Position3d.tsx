import { useAnnotationEventBus } from "@fiftyone/annotation";
import { LabeledField } from "@fiftyone/components";
import { DetectionLabel } from "@fiftyone/looker";
import { formatDegrees } from "@fiftyone/looker-3d/src/annotation/utils/rotation-utils";
import {
  useIsDragInProgress,
  useTransientCuboid,
  useWorkingLabel,
} from "@fiftyone/looker-3d/src/store";
import {
  quaternionToRadians,
  radiansToQuaternion,
} from "@fiftyone/looker-3d/src/utils";
import { DETECTION } from "@fiftyone/utilities";
import { Box, Stack, TextField } from "@mui/material";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Vector3Tuple } from "three";
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

export interface Position3dProps {
  readOnly?: boolean;
}

export default function Position3d({ readOnly = false }: Position3dProps) {
  const [transformState, setTransformState] = useState<Coordinates3d>({
    position: {},
    dimensions: {},
    rotation: {},
  });
  const data = useAtomValue<DetectionLabel>(currentData);
  const overlay = useAtomValue(currentOverlay);
  const eventBus = useAnnotationEventBus();
  const labelId = data?._id ?? "";

  const workingLabel = useWorkingLabel(labelId);

  // Need transient state for live drag preview
  const transientState = useTransientCuboid(labelId);
  const isDragInProgress = useIsDragInProgress();

  useEffect(() => {
    let baseLocation: Vector3Tuple | undefined;
    let baseDimensions: Vector3Tuple | undefined;
    let baseRotation: Vector3Tuple | undefined;
    let baseQuaternion: [number, number, number, number] | undefined;

    if (workingLabel && workingLabel._cls === DETECTION) {
      baseLocation = workingLabel.location;
      baseDimensions = workingLabel.dimensions;
      baseRotation = workingLabel.rotation;
      baseQuaternion = workingLabel.quaternion;
    } else if (data?.location && data?.dimensions) {
      // This shouldn't really happen but is here for a fallback
      baseLocation = data.location;
      baseDimensions = data.dimensions;
      baseRotation = data.rotation;
    }

    if (!baseLocation || !baseDimensions) {
      return;
    }

    // Apply transient deltas if they exist (like, during active drag)
    let displayLocation = baseLocation;
    let displayDimensions = baseDimensions;
    let displayQuaternion = baseQuaternion;

    if (transientState) {
      if (transientState.positionDelta) {
        displayLocation = [
          baseLocation[0] + transientState.positionDelta[0],
          baseLocation[1] + transientState.positionDelta[1],
          baseLocation[2] + transientState.positionDelta[2],
        ];
      }
      if (transientState.dimensionsDelta) {
        displayDimensions = [
          baseDimensions[0] + transientState.dimensionsDelta[0],
          baseDimensions[1] + transientState.dimensionsDelta[1],
          baseDimensions[2] + transientState.dimensionsDelta[2],
        ];
      }
      if (transientState.quaternionOverride) {
        displayQuaternion = transientState.quaternionOverride;
      }
    }

    // Convert quaternion to rotation for display
    let displayRotation = baseRotation;
    if (displayQuaternion) {
      displayRotation = quaternionToRadians(displayQuaternion);
    }

    setTransformState({
      position: {
        x: displayLocation[0],
        y: displayLocation[1],
        z: displayLocation[2],
      },
      dimensions: {
        lx: displayDimensions[0],
        ly: displayDimensions[1],
        lz: displayDimensions[2],
      },
      rotation: displayRotation
        ? {
            rx: displayRotation[0],
            ry: displayRotation[1],
            rz: displayRotation[2],
          }
        : { rx: 0, ry: 0, rz: 0 },
    });
  }, [data, workingLabel, transientState, isDragInProgress]);

  const handleUserInputChange = useCallback(
    (coordinateDelta: Partial<Coordinates3d>) => {
      if (readOnly || !data?._id) {
        return;
      }

      // synchronize internal state
      const newState = {
        position: {
          ...transformState.position,
          ...coordinateDelta.position,
        },
        dimensions: {
          ...transformState.dimensions,
          ...coordinateDelta.dimensions,
        },
        rotation: {
          ...transformState.rotation,
          ...coordinateDelta.rotation,
        },
      };
      setTransformState(newState);

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
    [data, transformState, overlay, eventBus, readOnly]
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
              value={formatValue(transformState.position.x)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { x: parseFloat(e.target.value) },
                });
              }}
              size="small"
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="y"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.position.y)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { y: parseFloat(e.target.value) },
                });
              }}
              size="small"
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="z"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.position.z)}
              onChange={(e) => {
                handleUserInputChange({
                  position: { z: parseFloat(e.target.value) },
                });
              }}
              size="small"
              disabled={readOnly}
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
              value={formatValue(transformState.dimensions.lx)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="ly"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.dimensions.ly)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { ly: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label="lz"
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.dimensions.lz)}
              onChange={(e) => {
                handleUserInputChange({
                  dimensions: { lz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.1 }}
              disabled={readOnly}
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
          label={`rx (${formatDegrees(transformState.rotation.rx)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.rx)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rx: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label={`ry (${formatDegrees(transformState.rotation.ry)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.ry)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { ry: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
              disabled={readOnly}
            />
          }
        />

        <LabeledField
          label={`rz (${formatDegrees(transformState.rotation.rz)}°)`}
          formControl={
            <TextField
              type="number"
              value={formatValue(transformState.rotation.rz)}
              onChange={(e) => {
                handleUserInputChange({
                  rotation: { rz: parseFloat(e.target.value) },
                });
              }}
              size="small"
              inputProps={{ step: 0.01 }}
              disabled={readOnly}
            />
          }
        />
      </Stack>
    </Box>
  );
}
