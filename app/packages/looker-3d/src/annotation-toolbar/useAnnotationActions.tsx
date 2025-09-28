import { Add, OpenWith, RotateRight, Straighten } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  isInTransformModeAtom,
  isPointTransformModeAtom,
  selectedLabelForAnnotationAtom,
  selectedPointAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../state";
import { CoordinateInputs } from "./CoordinateInputs";
import type { AnnotationAction, AnnotationActionGroup } from "./types";

export const useAnnotationActions = () => {
  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom
  );
  const [isInTransformMode, setIsInTransformMode] = useRecoilState(
    isInTransformModeAtom
  );
  const isPointTransformMode = useRecoilValue(isPointTransformModeAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const selectedPoint = useRecoilValue(selectedPointAtom);

  const hasSelectedLabel = !!selectedLabelForAnnotation;

  const handleTransformModeChange = useCallback(
    (mode: TransformMode) => {
      if (hasSelectedLabel) {
        setTransformMode(mode);
        if (!isInTransformMode) {
          setIsInTransformMode(true);
        }
      }
    },
    [
      hasSelectedLabel,
      setTransformMode,
      isInTransformMode,
      setIsInTransformMode,
    ]
  );

  const handleTransformSpaceChange = useCallback(
    (space: TransformSpace) => {
      setTransformSpace(space);
    },
    [setTransformSpace]
  );

  const actions: AnnotationActionGroup[] = useMemo(() => {
    const isPolyline = selectedLabelForAnnotation?._cls === "Polyline";

    const baseActions: AnnotationActionGroup[] = [
      {
        id: "polyline-actions",
        label: "Polyline",
        actions: [
          {
            id: "new-segment",
            label: "New Segment",
            icon: <Add />,
            shortcut: "V",
            tooltip: "Add new polyline segment",
            isActive: false,
            onClick: () => {
              alert("Not implemented! :(");
            },
          },
        ],
      },
      {
        id: "transform-actions",
        label: "Transform",
        actions: [
          {
            id: "translate",
            label: "Translate",
            icon: <OpenWith />,
            shortcut: "G",
            tooltip: "Move object (Grab)",
            isActive:
              (isInTransformMode || isPointTransformMode) &&
              transformMode === "translate",
            isDisabled: !hasSelectedLabel && !isPointTransformMode,
            onClick: () => handleTransformModeChange("translate"),
          },
          {
            id: "rotate",
            label: "Rotate",
            icon: <RotateRight />,
            shortcut: "R",
            tooltip: "Rotate object",
            isActive: isInTransformMode && transformMode === "rotate",
            isDisabled: !hasSelectedLabel || isPolyline,
            onClick: () => handleTransformModeChange("rotate"),
          },
          {
            id: "scale",
            label: "Scale",
            icon: <Straighten />,
            shortcut: "S",
            tooltip: "Scale object",
            isActive: isInTransformMode && transformMode === "scale",
            isDisabled: !hasSelectedLabel || isPolyline,
            onClick: () => handleTransformModeChange("scale"),
          },
        ],
      },
      {
        id: "space-actions",
        label: "Space",
        isHidden: !isInTransformMode,
        actions: [
          {
            id: "world-space",
            label: "World Space",
            icon: <Typography variant="caption">W</Typography>,
            shortcut: "X/Y/Z",
            tooltip: "Transform in world space",
            isActive: transformSpace === "world",
            isDisabled: !isInTransformMode,
            isVisible: isInTransformMode,
            onClick: () => handleTransformSpaceChange("world"),
          },
          {
            id: "local-space",
            label: "Local Space",
            icon: <Typography variant="caption">L</Typography>,
            shortcut: "XX/YY/ZZ",
            tooltip: "Transform in local space",
            isActive: transformSpace === "local",
            isDisabled: !isInTransformMode,
            isVisible: isInTransformMode,
            onClick: () => handleTransformSpaceChange("local"),
          },
        ],
      },
    ];

    if (selectedPoint) {
      const coordinateInputAction: AnnotationAction = {
        id: "coordinate-inputs-component",
        label: "Coordinates",
        icon: <Typography variant="caption">XYZ</Typography>,
        tooltip: "Edit point coordinates",
        isActive: false,
        isDisabled: false,
        isVisible: true,
        // No-op since this is a custom component
        onClick: () => {},
        customComponent: <CoordinateInputs />,
      };

      baseActions.push({
        id: "coordinate-inputs",
        actions: [coordinateInputAction],
      });
    }

    return baseActions;
  }, [
    isInTransformMode,
    hasSelectedLabel,
    transformMode,
    isPointTransformMode,
    handleTransformModeChange,
    transformSpace,
    handleTransformSpaceChange,
    selectedLabelForAnnotation,
    selectedPoint,
  ]);

  return {
    actions,
    hasSelectedLabel,
    isInTransformMode,
    transformMode,
    transformSpace,
  };
};
