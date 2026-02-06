import { Box, TextField } from "@mui/material";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  annotationPlaneAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  tempVertexTransformsAtom,
} from "../../state";
import { isPolyline3dOverlay } from "../../types";
import { eulerToQuaternion, quaternionToEuler } from "../../utils";
import { usePolylineOperations, useWorkingLabel } from "../store";
import { updateVertexPosition } from "../utils/polyline-utils";

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
  const selectedPoint = useRecoilValue(selectedPolylineVertexAtom);
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);

  const workingLabel = useWorkingLabel(selectedPoint?.labelId ?? "");
  const { updatePolylinePoints } = usePolylineOperations();

  const vertexKey = selectedPoint
    ? `${selectedPoint.labelId}-${selectedPoint.segmentIndex}-${selectedPoint.pointIndex}`
    : "";
  const tempVertexTransforms = useRecoilValue(
    tempVertexTransformsAtom(vertexKey)
  );

  const points3d = useMemo(() => {
    if (workingLabel && isPolyline3dOverlay(workingLabel)) {
      return workingLabel.points3d;
    }
    return null;
  }, [workingLabel]);

  // Base position from working store
  const workingPointPosition = useMemo(() => {
    if (!selectedPoint || !points3d) return null;

    const { segmentIndex, pointIndex } = selectedPoint;

    if (
      segmentIndex < points3d.length &&
      pointIndex < points3d[segmentIndex].length
    ) {
      return points3d[segmentIndex][pointIndex];
    }

    return null;
  }, [selectedPoint, points3d]);

  // Effective position: working position + transient offset (if dragging)
  const selectedPointPosition = useMemo(() => {
    if (!workingPointPosition) return null;

    if (tempVertexTransforms?.position) {
      // During drag, add the offset to get the live position
      return [
        workingPointPosition[0] + tempVertexTransforms.position[0],
        workingPointPosition[1] + tempVertexTransforms.position[1],
        workingPointPosition[2] + tempVertexTransforms.position[2],
      ];
    }

    return workingPointPosition;
  }, [workingPointPosition, tempVertexTransforms]);

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

      if (selectedPoint && selectedLabel && points3d && selectedPointPosition) {
        const { segmentIndex, pointIndex, labelId } = selectedPoint;

        const newPosition: [number, number, number] = [
          ...selectedPointPosition,
        ];
        if (axis === "x") newPosition[0] = numValue;
        else if (axis === "y") newPosition[1] = numValue;
        else if (axis === "z") newPosition[2] = numValue;

        const newSegments = updateVertexPosition(
          points3d,
          // Pass all current segments so unchanged ones are preserved
          points3d.map((seg) => ({ points: seg })),
          segmentIndex,
          pointIndex,
          newPosition,
          // Update shared vertices
          true
        );

        // Convert segments to points3d format and update working store
        const newPoints3d = newSegments.map((seg) => seg.points);
        updatePolylinePoints(labelId, newPoints3d);
      }
    },
    [
      selectedPoint,
      selectedLabel,
      points3d,
      selectedPointPosition,
      updatePolylinePoints,
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
