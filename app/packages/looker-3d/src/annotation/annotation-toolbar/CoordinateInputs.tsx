import { Box, TextField } from "@mui/material";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import type { PolyLineProps } from "../../labels/polyline";
import {
  annotationPlaneAtom,
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
} from "../../state";
import { eulerToQuaternion, quaternionToEuler } from "../../utils";
import {
  getVertexPosition,
  updateVertexPosition,
} from "../utils/polyline-utils";

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
        ref={ref}
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
  const [polylinePointTransforms, setPolylinePointTransforms] = useRecoilState(
    polylinePointTransformsAtom
  );
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

        setPolylinePointTransforms((prev) => {
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

          return {
            ...prev,
            [labelId]: {
              segments: newSegments,
              path: prev[labelId].path,
              sampleId: prev[labelId].sampleId,
            },
          };
        });
      }
    },
    [
      selectedPoint,
      selectedLabel,
      selectedPointPosition,
      setPolylinePointTransforms,
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
