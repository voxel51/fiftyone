import { Add, OpenWith, RotateRight, Straighten } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import {
  isInTransformModeAtom,
  selectedLabelForAnnotationAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../state";
import type { AnnotationActionGroup } from "./types";

export const useAnnotationActions = () => {
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [isInTransformMode, setIsInTransformMode] = useRecoilState(
    isInTransformModeAtom
  );
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);

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

    return [
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
            isActive: isInTransformMode && transformMode === "translate",
            isDisabled: !hasSelectedLabel,
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
    ] as AnnotationActionGroup[];
  }, [
    isInTransformMode,
    hasSelectedLabel,
    transformMode,
    handleTransformModeChange,
    transformSpace,
    handleTransformSpaceChange,
    selectedLabelForAnnotation,
  ]);

  return {
    actions,
    hasSelectedLabel,
    isInTransformMode,
    transformMode,
    transformSpace,
  };
};
