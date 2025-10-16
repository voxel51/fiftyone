import { Box, TextField } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import type { PolyLineProps } from "../../labels/polyline";
import {
  annotationPlaneAtom,
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
} from "../../state";
import {
  getVertexPosition,
  updateDuplicateVertices,
  applyTransformsToPolyline,
} from "../utils/polyline-utils";

interface CoordinateInputsProps {
  className?: string;
  hideTranslate?: boolean;
  hideQuaternion?: boolean;
}

interface CoordinateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

const CoordinateField = ({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
}: CoordinateFieldProps) => {
  return (
    <TextField
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
};

export const PlaneCoordinateInputs = ({
  className,
  hideTranslate = false,
  hideQuaternion = true,
}: CoordinateInputsProps) => {
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const [x, setX] = useState<string>("0");
  const [y, setY] = useState<string>("0");
  const [z, setZ] = useState<string>("0");
  const [qx, setQx] = useState<string>("0");
  const [qy, setQy] = useState<string>("0");
  const [qz, setQz] = useState<string>("0");
  const [qw, setQw] = useState<string>("1");

  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (annotationPlane && !isEditing) {
      setX(annotationPlane.position[0].toFixed(3));
      setY(annotationPlane.position[1].toFixed(3));
      setZ(annotationPlane.position[2].toFixed(3));
      setQx(annotationPlane.quaternion[0].toFixed(3));
      setQy(annotationPlane.quaternion[1].toFixed(3));
      setQz(annotationPlane.quaternion[2].toFixed(3));
      setQw(annotationPlane.quaternion[3].toFixed(3));
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

  const handleQuaternionChange = useCallback(
    (axis: "x" | "y" | "z" | "w", value: string) => {
      // Always update local state to allow blank values while editing
      if (axis === "x") setQx(value);
      else if (axis === "y") setQy(value);
      else if (axis === "z") setQz(value);
      else if (axis === "w") setQw(value);

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const newQuaternion: [number, number, number, number] = [
        ...annotationPlane.quaternion,
      ];
      if (axis === "x") newQuaternion[0] = numValue;
      else if (axis === "y") newQuaternion[1] = numValue;
      else if (axis === "z") newQuaternion[2] = numValue;
      else if (axis === "w") newQuaternion[3] = numValue;

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
        {!hideQuaternion && (
          <>
            <CoordinateField
              label="QX"
              value={qx}
              onChange={(value) => handleQuaternionChange("x", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="QY"
              value={qy}
              onChange={(value) => handleQuaternionChange("y", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="QZ"
              value={qz}
              onChange={(value) => handleQuaternionChange("z", value)}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
            />
            <CoordinateField
              label="QW"
              value={qw}
              onChange={(value) => handleQuaternionChange("w", value)}
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
    const transforms = polylinePointTransforms[selectedPoint.labelId] || [];

    return getVertexPosition(
      selectedPoint,
      polylineLabel.points3d || [],
      transforms
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
          const currentTransforms = prev[labelId] || [];
          const polylineLabel = selectedLabel as unknown as PolyLineProps;
          const originalPoints = polylineLabel.points3d || [];

          // Get current position (either from existing transform or original point)
          let currentPosition: [number, number, number];
          const existingTransformIndex = currentTransforms.findIndex(
            (transform) =>
              transform.segmentIndex === segmentIndex &&
              transform.pointIndex === pointIndex
          );

          if (existingTransformIndex >= 0) {
            currentPosition =
              currentTransforms[existingTransformIndex].position;
          } else if (selectedPointPosition) {
            currentPosition = selectedPointPosition;
          } else {
            // Fallback to original position from label
            if (
              segmentIndex < originalPoints.length &&
              pointIndex < originalPoints[segmentIndex].length
            ) {
              currentPosition = originalPoints[segmentIndex][pointIndex] as [
                number,
                number,
                number
              ];
            } else {
              currentPosition = [0, 0, 0];
            }
          }

          const newPosition: [number, number, number] = [...currentPosition];
          if (axis === "x") newPosition[0] = numValue;
          else if (axis === "y") newPosition[1] = numValue;
          else if (axis === "z") newPosition[2] = numValue;

          // Compute current effective points to find all shared vertices
          const effectivePoints3d = applyTransformsToPolyline(
            originalPoints,
            currentTransforms
          );

          // Use updateDuplicateVertices to handle shared vertices
          const newTransforms = updateDuplicateVertices(
            currentPosition,
            newPosition,
            effectivePoints3d,
            currentTransforms
          );

          return { ...prev, [labelId]: newTransforms };
        });

        // Note: this is a hack because transform controls
        // is updating in a buggy way when the point is moved
        const prevSelectedPoint = selectedPoint;
        setSelectedPoint(null);
        setTimeout(() => {
          setSelectedPoint(prevSelectedPoint);
        }, 0);
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
