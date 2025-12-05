import * as fos from "@fiftyone/state";
import { Box, TextField } from "@mui/material";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import type { PolyLineProps } from "../../labels/polyline";
import {
  annotationPlaneAtom,
  currentActiveAnnotationField3dAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  tempLabelTransformsAtom,
} from "../../state";
import { eulerToQuaternion, quaternionToEuler } from "../../utils";
import {
  getVertexPosition,
  updateVertexPosition,
} from "../utils/polyline-utils";

// Note: eulerToQuaternion and quaternionToEuler are still used by PlaneCoordinateInputs

interface CoordinateInputsProps {
  className?: string;
  hideTranslate?: boolean;
  hideRotation?: boolean;
}

interface CoordinateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

const CoordinateField = forwardRef<HTMLInputElement, CoordinateFieldProps>(
  ({ label, value, onChange, onFocus, onBlur }, ref) => {
    return (
      <TextField
        inputRef={ref}
        size="small"
        label={label}
        value={value}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        inputProps={{
          step: "0.1",
          style: { fontSize: "11px", padding: "4px 6px" },
        }}
        sx={{
          "& .MuiInputLabel-root": { fontSize: "10px" },
          "& .MuiOutlinedInput-root": { height: "24px" },
          "& .MuiOutlinedInput-input": { padding: "4px 6px" },
        }}
      />
    );
  }
);

export const PlaneCoordinateInputs = ({
  className,
  hideTranslate = false,
  hideRotation = false,
}: CoordinateInputsProps) => {
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const [x, setX] = useState<string>("0");
  const [y, setY] = useState<string>("0");
  const [z, setZ] = useState<string>("0");
  const [rx, setRx] = useState<string>("0");
  const [ry, setRy] = useState<string>("0");
  const [rz, setRz] = useState<string>("0");

  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (annotationPlane && !isEditing) {
      setX(annotationPlane.position[0].toFixed(3));
      setY(annotationPlane.position[1].toFixed(3));
      setZ(annotationPlane.position[2].toFixed(3));

      // Convert quaternion to Euler angles
      const eulerAngles = quaternionToEuler(annotationPlane.quaternion);
      setRx(eulerAngles[0].toFixed(1));
      setRy(eulerAngles[1].toFixed(1));
      setRz(eulerAngles[2].toFixed(1));
    }
  }, [annotationPlane, isEditing]);

  const handlePositionChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      // Always update local state to allow blank values while editing
      if (axis === "x") setX(value);
      else if (axis === "y") setY(value);
      else if (axis === "z") setZ(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const newPosition: [number, number, number] = [
        ...annotationPlane.position,
      ];
      if (axis === "x") newPosition[0] = numValue;
      else if (axis === "y") newPosition[1] = numValue;
      else if (axis === "z") newPosition[2] = numValue;

      setAnnotationPlane((prev) => ({
        ...prev,
        position: newPosition,
      }));
    },
    [annotationPlane.position]
  );

  const handleRotationChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      // Update local state to allow blank values while editing
      if (axis === "x") setRx(value);
      else if (axis === "y") setRy(value);
      else if (axis === "z") setRz(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      // Get current Euler angles and update the changed axis
      const currentEuler = quaternionToEuler(annotationPlane.quaternion);
      const newEuler: [number, number, number] = [...currentEuler];
      if (axis === "x") newEuler[0] = numValue;
      else if (axis === "y") newEuler[1] = numValue;
      else if (axis === "z") newEuler[2] = numValue;

      const newQuaternion = eulerToQuaternion(newEuler);

      setAnnotationPlane((prev) => ({
        ...prev,
        quaternion: newQuaternion,
      }));
    },
    [annotationPlane.quaternion]
  );

  if (!annotationPlane.enabled) {
    return null;
  }

  return (
    <Box
      className={className}
      sx={{
        marginTop: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: "60px",
        }}
      >
        {!hideTranslate && (
          <>
            {annotationPlane.showX && (
              <CoordinateField
                label="X"
                value={x}
                onChange={(value) => handlePositionChange("x", value)}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
              />
            )}
            {annotationPlane.showY && (
              <CoordinateField
                label="Y"
                value={y}
                onChange={(value) => handlePositionChange("y", value)}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
              />
            )}
            {annotationPlane.showZ && (
              <CoordinateField
                label="Z"
                value={z}
                onChange={(value) => handlePositionChange("z", value)}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
              />
            )}
          </>
        )}
        {!hideRotation && (
          <>
            <CoordinateField
              label="RX"
              value={rx}
              onChange={(value) => handleRotationChange("x", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="RY"
              value={ry}
              onChange={(value) => handleRotationChange("y", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="RZ"
              value={rz}
              onChange={(value) => handleRotationChange("z", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
          </>
        )}
      </Box>
    </Box>
  );
};

export const VertexCoordinateInputs = ({
  className,
  hideTranslate = false,
}: CoordinateInputsProps) => {
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const [polylinePointTransforms, setStagedPolylineTransforms] = useRecoilState(
    stagedPolylineTransformsAtom
  );
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);

  const selectedPointPosition = useMemo(() => {
    if (!selectedPoint || !selectedLabel) return null;

    const polylineLabel = selectedLabel as unknown as PolyLineProps;
    const segments =
      polylinePointTransforms[selectedPoint.labelId]?.segments || [];

    return getVertexPosition(
      selectedPoint,
      polylineLabel.points3d || [],
      segments
    );
  }, [selectedPoint, selectedLabel, polylinePointTransforms]);
  const [x, setX] = useState<string>("0");
  const [y, setY] = useState<string>("0");
  const [z, setZ] = useState<string>("0");

  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (selectedPointPosition && !isEditing) {
      setX(selectedPointPosition[0].toFixed(3));
      setY(selectedPointPosition[1].toFixed(3));
      setZ(selectedPointPosition[2].toFixed(3));
    }
  }, [selectedPointPosition, isEditing]);

  const handleCoordinateChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      // Always update local state to allow blank values while editing
      if (axis === "x") setX(value);
      else if (axis === "y") setY(value);
      else if (axis === "z") setZ(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      if (selectedPoint && selectedLabel) {
        const { segmentIndex, pointIndex, labelId } = selectedPoint;

        setStagedPolylineTransforms((prev) => {
          const currentSegments = prev[labelId]?.segments || [];
          const polylineLabel = selectedLabel as unknown as PolyLineProps;
          const points3d = polylineLabel.points3d || [];

          if (!selectedPointPosition) return prev;

          const newPosition: [number, number, number] = [
            ...selectedPointPosition,
          ];
          if (axis === "x") newPosition[0] = numValue;
          else if (axis === "y") newPosition[1] = numValue;
          else if (axis === "z") newPosition[2] = numValue;

          // Update this vertex position and all shared vertices
          const newSegments = updateVertexPosition(
            points3d,
            currentSegments,
            segmentIndex,
            pointIndex,
            newPosition,
            // Update shared vertices
            true
          );

          const existingLabelData = prev[labelId];
          const path = existingLabelData?.path || currentActiveField || "";
          const sampleId = existingLabelData?.sampleId || currentSampleId;

          return {
            ...prev,
            [labelId]: {
              ...(existingLabelData ?? {}),
              segments: newSegments,
              path,
              sampleId,
            },
          };
        });
      }
    },
    [
      selectedPoint,
      selectedLabel,
      selectedPointPosition,
      setStagedPolylineTransforms,
      currentActiveField,
      currentSampleId,
    ]
  );

  if (!selectedPoint) {
    return null;
  }

  return (
    <Box
      className={className}
      sx={{
        marginTop: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: "60px",
        }}
      >
        {!hideTranslate && (
          <>
            <CoordinateField
              label="X"
              value={x}
              onChange={(value) => handleCoordinateChange("x", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="Y"
              value={y}
              onChange={(value) => handleCoordinateChange("y", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="Z"
              value={z}
              onChange={(value) => handleCoordinateChange("z", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
          </>
        )}
      </Box>
    </Box>
  );
};

export const CuboidCoordinateInputs = ({
  className,
  hideTranslate = false,
}: CoordinateInputsProps) => {
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const [stagedCuboidTransforms, setStagedCuboidTransforms] = useRecoilState(
    stagedCuboidTransformsAtom
  );

  // Read temp transforms for transient display during active transforms
  const tempTransforms = useRecoilValue(
    tempLabelTransformsAtom(selectedLabel?._id ?? "")
  );

  const currentTransform = useMemo(() => {
    if (!selectedLabel) return null;
    return stagedCuboidTransforms[selectedLabel._id];
  }, [selectedLabel, stagedCuboidTransforms]);

  // Position state
  const [x, setX] = useState<string>("0");
  const [y, setY] = useState<string>("0");
  const [z, setZ] = useState<string>("0");

  // Dimensions state
  const [width, setWidth] = useState<string>("0");
  const [height, setHeight] = useState<string>("0");
  const [depth, setDepth] = useState<string>("0");

  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (!isEditing) {
      // Use temp transforms (transient) if available, otherwise use staged transforms
      const location = currentTransform?.location;
      const dimensions =
        tempTransforms?.dimensions ?? currentTransform?.dimensions;

      if (location) {
        setX(location[0].toFixed(3));
        setY(location[1].toFixed(3));
        setZ(location[2].toFixed(3));
      }
      if (dimensions) {
        setWidth(dimensions[0].toFixed(3));
        setHeight(dimensions[1].toFixed(3));
        setDepth(dimensions[2].toFixed(3));
      }
    }
  }, [currentTransform, tempTransforms, isEditing]);

  const handlePositionChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      if (axis === "x") setX(value);
      else if (axis === "y") setY(value);
      else if (axis === "z") setZ(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue) || !selectedLabel) return;

      setStagedCuboidTransforms((prev) => {
        const current = prev[selectedLabel._id] || {};
        const newLocation: [number, number, number] = [
          ...(current.location || [0, 0, 0]),
        ];
        if (axis === "x") newLocation[0] = numValue;
        else if (axis === "y") newLocation[1] = numValue;
        else if (axis === "z") newLocation[2] = numValue;

        return {
          ...prev,
          [selectedLabel._id]: {
            ...current,
            location: newLocation,
          },
        };
      });
    },
    [selectedLabel, setStagedCuboidTransforms]
  );

  const handleDimensionChange = useCallback(
    (axis: "width" | "height" | "depth", value: string) => {
      if (axis === "width") setWidth(value);
      else if (axis === "height") setHeight(value);
      else if (axis === "depth") setDepth(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue) || !selectedLabel) return;

      setStagedCuboidTransforms((prev) => {
        const current = prev[selectedLabel._id] || {};
        const newDimensions: [number, number, number] = [
          ...(current.dimensions || [1, 1, 1]),
        ];
        if (axis === "width") newDimensions[0] = numValue;
        else if (axis === "height") newDimensions[1] = numValue;
        else if (axis === "depth") newDimensions[2] = numValue;

        return {
          ...prev,
          [selectedLabel._id]: {
            ...current,
            dimensions: newDimensions,
          },
        };
      });
    },
    [selectedLabel, setStagedCuboidTransforms]
  );

  if (!selectedLabel) {
    return null;
  }

  return (
    <Box
      className={className}
      sx={{
        marginTop: "20px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          width: "60px",
        }}
      >
        {!hideTranslate && (
          <>
            <CoordinateField
              label="X"
              value={x}
              onChange={(value) => handlePositionChange("x", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="Y"
              value={y}
              onChange={(value) => handlePositionChange("y", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="Z"
              value={z}
              onChange={(value) => handlePositionChange("z", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
          </>
        )}
        {/* Dimensions */}
        <CoordinateField
          label="W"
          value={width}
          onChange={(value) => handleDimensionChange("width", value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
        />
        <CoordinateField
          label="H"
          value={height}
          onChange={(value) => handleDimensionChange("height", value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
        />
        <CoordinateField
          label="D"
          value={depth}
          onChange={(value) => handleDimensionChange("depth", value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
        />
      </Box>
    </Box>
  );
};
