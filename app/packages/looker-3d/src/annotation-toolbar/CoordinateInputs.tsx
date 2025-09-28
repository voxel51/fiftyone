import { Box, TextField } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Vector3 } from "three";
import { usePointUpdateRegistry } from "../hooks/usePointUpdateRegistry";
import {
  selectedLabelForAnnotationAtom,
  selectedPointAtom,
  transformedLabelsAtom,
} from "../state";

interface CoordinateInputsProps {
  className?: string;
}

export const CoordinateInputs = ({ className }: CoordinateInputsProps) => {
  const [selectedPoint, setSelectedPoint] = useRecoilState(selectedPointAtom);
  const [transformedLabels, setTransformedLabels] = useRecoilState(
    transformedLabelsAtom
  );
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const { updatePoint } = usePointUpdateRegistry();
  const [x, setX] = useState<string>("0");
  const [y, setY] = useState<string>("0");
  const [z, setZ] = useState<string>("0");

  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Update local state when selectedPoint changes
  useEffect(() => {
    if (selectedPoint && !isEditing) {
      setX(selectedPoint.position[0].toFixed(3));
      setY(selectedPoint.position[1].toFixed(3));
      setZ(selectedPoint.position[2].toFixed(3));
    }
  }, [selectedPoint, isEditing]);

  const handleCoordinateChange = useCallback(
    (axis: "x" | "y" | "z", value: string) => {
      // Always update local state to allow blank values while editing
      if (axis === "x") setX(value);
      else if (axis === "y") setY(value);
      else if (axis === "z") setZ(value);

      // Only update the actual point position if we have a valid number
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      // Update the selected point position
      if (selectedPoint && selectedLabel) {
        const newPosition: [number, number, number] = [
          ...selectedPoint.position,
        ];
        if (axis === "x") newPosition[0] = numValue;
        else if (axis === "y") newPosition[1] = numValue;
        else if (axis === "z") newPosition[2] = numValue;

        setSelectedPoint({
          ...selectedPoint,
          position: newPosition,
        });

        updatePoint(
          selectedPoint.segmentIndex,
          selectedPoint.pointIndex,
          new Vector3(newPosition[0], newPosition[1], newPosition[2])
        );

        // Update the transformedLabelsAtom with the new point position
        setTransformedLabels((prev) => {
          const labelId = selectedLabel._id;
          const currentTransform = prev[labelId] || {
            worldPosition: [0, 0, 0] as [number, number, number],
            dimensions: [1, 1, 1] as [number, number, number],
            localRotation: [0, 0, 0] as [number, number, number],
            worldRotation: [0, 0, 0] as [number, number, number],
          };

          // For polylines, we need to update the specific point in the points3d array
          // This is a simplified approach - in a real implementation, you might want to
          // store point-specific transformations
          return {
            ...prev,
            [labelId]: {
              ...currentTransform,
              worldPosition: newPosition,
            },
          };
        });
      }
    },
    [
      selectedPoint,
      setSelectedPoint,
      selectedLabel,
      setTransformedLabels,
      updatePoint,
    ]
  );

  if (!selectedPoint) {
    return null;
  }

  return (
    <Box
      className={className}
      sx={{
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
        <TextField
          size="small"
          label="X"
          value={x}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChange={(e) => handleCoordinateChange("x", e.target.value)}
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
        <TextField
          size="small"
          label="Y"
          value={y}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChange={(e) => handleCoordinateChange("y", e.target.value)}
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
        <TextField
          size="small"
          label="Z"
          value={z}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChange={(e) => handleCoordinateChange("z", e.target.value)}
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
      </Box>
    </Box>
  );
};
