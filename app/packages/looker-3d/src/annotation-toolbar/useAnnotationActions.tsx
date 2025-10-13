import {
  Add,
  Close,
  GridOn,
  OpenWith,
  RotateRight,
  Straighten,
} from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import {
  annotationPlaneAtom,
  isInEntireLabelTransformModeAtom,
  isPointTransformModeAtom,
  segmentPolylineStateAtom,
  selectedLabelForAnnotationAtom,
  selectedPointAtom,
  tempPolylinesAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { CoordinateInputs } from "./CoordinateInputs";
import type { AnnotationAction, AnnotationActionGroup } from "./types";

export const useAnnotationActions = () => {
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [isInEntireLabelTransformMode, setIsInTransformMode] = useRecoilState(
    isInEntireLabelTransformModeAtom
  );
  const isPointTransformMode = useRecoilValue(isPointTransformModeAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const selectedPoint = useRecoilValue(selectedPointAtom);
  const [segmentPolylineState, setSegmentPolylineState] = useRecoilState(
    segmentPolylineStateAtom
  );
  const [tempPolylines, setTempPolylines] = useRecoilState(tempPolylinesAtom);
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const { sceneBoundingBox, upVector } = useFo3dContext();

  const hasSelectedLabel = !!selectedLabelForAnnotation;

  const handleTransformModeChange = useCallback(
    (mode: TransformMode) => {
      if (hasSelectedLabel) {
        setTransformMode(mode);
        if (!isInEntireLabelTransformMode) {
          setIsInTransformMode(true);
        }
      }
    },
    [
      hasSelectedLabel,
      setTransformMode,
      isInEntireLabelTransformMode,
      setIsInTransformMode,
    ]
  );

  const handleTransformSpaceChange = useCallback(
    (space: TransformSpace) => {
      setTransformSpace(space);
    },
    [setTransformSpace]
  );

  const handleStartSegmentPolyline = useCallback(() => {
    setSegmentPolylineState({
      isActive: true,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
  }, [setSegmentPolylineState]);

  const handleCancelSegmentPolyline = useCallback(() => {
    setSegmentPolylineState({
      isActive: false,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
  }, [setSegmentPolylineState]);

  const handleClearTempPolylines = useCallback(() => {
    setTempPolylines([]);
  }, [setTempPolylines]);

  const handleToggleAnnotationPlane = useCallback(() => {
    if (!annotationPlane.enabled) {
      // Initialize plane at center of scene bounding box with upVector normal
      if (sceneBoundingBox && upVector) {
        const center = sceneBoundingBox.getCenter(new THREE.Vector3());
        const quaternion = getGridQuaternionFromUpVector(
          upVector,
          new THREE.Vector3(0, 0, 1)
        );

        setAnnotationPlane({
          enabled: true,
          position: [center.x, center.y, center.z],
          quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
        });
      } else {
        // Fallback to origin with Y-up
        setAnnotationPlane({
          enabled: true,
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
        });
      }
    } else {
      setAnnotationPlane((prev) => ({ ...prev, enabled: false }));
    }
  }, [annotationPlane.enabled, sceneBoundingBox, upVector, setAnnotationPlane]);

  const actions: AnnotationActionGroup[] = useMemo(() => {
    const isPolyline = selectedLabelForAnnotation?._cls === "Polyline";

    const baseActions: AnnotationActionGroup[] = [
      {
        id: "edit-actions",
        label: "Edit",
        isHidden: selectedLabelForAnnotation === null,
        actions: [
          {
            id: "exit-edit-mode",
            label: "Deselect",
            icon: <Close />,
            shortcut: "Esc",
            tooltip: "Exit edit mode and deselect annotation",
            isActive: false,
            isVisible: selectedLabelForAnnotation !== null,
            onClick: () => setSelectedLabelForAnnotation(null),
          },
        ],
      },
      {
        id: "polyline-actions",
        label: "Polyline",
        actions: [
          {
            id: "new-segment",
            label: "New Segment",
            icon: <Add />,
            tooltip: "Add new polyline segment",
            isActive: segmentPolylineState.isActive,
            onClick: segmentPolylineState.isActive
              ? handleCancelSegmentPolyline
              : handleStartSegmentPolyline,
          },
          {
            id: "clear-temp-polylines",
            label: "Clear Temp",
            icon: <Close />,
            tooltip: "Clear temporary polylines",
            isActive: false,
            isVisible: tempPolylines.length > 0,
            onClick: handleClearTempPolylines,
          },
          {
            id: "toggle-annotation-plane",
            label: "Annotation Plane",
            icon: <GridOn />,
            tooltip: "Toggle annotation plane for z-drift prevention",
            isActive: annotationPlane.enabled,
            onClick: handleToggleAnnotationPlane,
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
              (isInEntireLabelTransformMode || isPointTransformMode) &&
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
            isActive:
              isInEntireLabelTransformMode && transformMode === "rotate",
            isDisabled: !hasSelectedLabel || isPolyline,
            onClick: () => handleTransformModeChange("rotate"),
          },
          {
            id: "scale",
            label: "Scale",
            icon: <Straighten />,
            shortcut: "S",
            tooltip: "Scale object",
            isActive: isInEntireLabelTransformMode && transformMode === "scale",
            isDisabled: !hasSelectedLabel || isPolyline,
            onClick: () => handleTransformModeChange("scale"),
          },
        ],
      },
      {
        id: "space-actions",
        label: "Space",
        isHidden: !isInEntireLabelTransformMode,
        actions: [
          {
            id: "world-space",
            label: "World Space",
            icon: <Typography variant="caption">W</Typography>,
            shortcut: "X/Y/Z",
            tooltip: "Transform in world space",
            isActive: transformSpace === "world",
            isDisabled: !isInEntireLabelTransformMode,
            isVisible: isInEntireLabelTransformMode,
            onClick: () => handleTransformSpaceChange("world"),
          },
          {
            id: "local-space",
            label: "Local Space",
            icon: <Typography variant="caption">L</Typography>,
            shortcut: "XX/YY/ZZ",
            tooltip: "Transform in local space",
            isActive: transformSpace === "local",
            isDisabled: !isInEntireLabelTransformMode,
            isVisible: isInEntireLabelTransformMode,
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
    isInEntireLabelTransformMode,
    hasSelectedLabel,
    transformMode,
    isPointTransformMode,
    handleTransformModeChange,
    transformSpace,
    handleTransformSpaceChange,
    selectedLabelForAnnotation,
    selectedPoint,
    segmentPolylineState,
    tempPolylines,
    annotationPlane,
    handleStartSegmentPolyline,
    handleCancelSegmentPolyline,
    handleClearTempPolylines,
    handleToggleAnnotationPlane,
  ]);

  return {
    actions,
    hasSelectedLabel,
    isInEntireLabelTransformMode,
    transformMode,
    transformSpace,
  };
};
