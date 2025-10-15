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
import MagnetIcon from "../../assets/icons/magnet.svg?react";
import { useFo3dContext } from "../../fo3d/context";
import {
  annotationPlaneAtom,
  currentArchetypeSelectedForTransformAtom,
  isSnapToAnnotationPlaneAtom,
  segmentPolylineStateAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  tempPolylinesAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../../state";
import { getGridQuaternionFromUpVector } from "../../utils";
import {
  PlaneCoordinateInputs,
  VertexCoordinateInputs,
} from "./CoordinateInputs";
import type { AnnotationAction, AnnotationActionGroup } from "./types";

export const useAnnotationActions = () => {
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [
    currentArchetypeSelectedForTransform,
    setCurrentArchetypeSelectedForTransform,
  ] = useRecoilState(currentArchetypeSelectedForTransformAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const selectedPoint = useRecoilValue(selectedPolylineVertexAtom);
  const [segmentPolylineState, setSegmentPolylineState] = useRecoilState(
    segmentPolylineStateAtom
  );
  const [isSnapToAnnotationPlane, setIsSnapToAnnotationPlane] = useRecoilState(
    isSnapToAnnotationPlaneAtom
  );
  const [tempPolylines, setTempPolylines] = useRecoilState(tempPolylinesAtom);
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const { sceneBoundingBox, upVector } = useFo3dContext();

  const handleTransformModeChange = useCallback(
    (mode: TransformMode) => {
      setTransformMode(mode);
    },
    [setTransformMode]
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
          showX: false,
          showY: false,
          showZ: false,
        });
      } else {
        // Fallback to origin with Y-up
        setAnnotationPlane({
          enabled: true,
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          showX: false,
          showY: true,
          showZ: false,
        });
      }
    } else {
      setAnnotationPlane((prev) => ({ ...prev, enabled: false }));
      setCurrentArchetypeSelectedForTransform(null);
    }
  }, [annotationPlane.enabled, sceneBoundingBox, upVector]);

  const actions: AnnotationActionGroup[] = useMemo(() => {
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
            id: "snap-to-annotation-plane",
            label: "Snap to Annotation Plane",
            icon: (
              <MagnetIcon
                width={"100%"}
                height={"100%"}
                fill={
                  isSnapToAnnotationPlane || annotationPlane.enabled
                    ? "#000"
                    : "#fff"
                }
              />
            ),
            tooltip:
              annotationPlane.enabled && !isSnapToAnnotationPlane
                ? "Project vertices to the annotation plane"
                : "Project vertices to the annotation plane whether or not it is enabled",
            isActive: isSnapToAnnotationPlane || annotationPlane.enabled,
            isDisabled: annotationPlane.enabled,
            isVisible: true,
            onClick: () => setIsSnapToAnnotationPlane(!isSnapToAnnotationPlane),
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
        isHidden: !currentArchetypeSelectedForTransform,
        actions: [
          {
            id: "translate",
            label: "Translate",
            icon: <OpenWith />,
            tooltip: "Translate or move object",
            isActive:
              currentArchetypeSelectedForTransform &&
              transformMode === "translate",
            isDisabled: !currentArchetypeSelectedForTransform,
            onClick: () => handleTransformModeChange("translate"),
          },
          {
            id: "rotate",
            label: "Rotate",
            icon: <RotateRight />,
            tooltip: "Rotate object",
            isVisible: currentArchetypeSelectedForTransform === "cuboid",
            isActive: transformMode === "rotate",
            onClick: () => handleTransformModeChange("rotate"),
          },
          {
            id: "scale",
            label: "Scale",
            icon: <Straighten />,
            tooltip: "Scale object",
            isActive: transformMode === "scale",
            isVisible: currentArchetypeSelectedForTransform === "cuboid",
            onClick: () => handleTransformModeChange("scale"),
          },
        ],
      },
      {
        id: "space-actions",
        label: "Space",
        isHidden:
          currentArchetypeSelectedForTransform !== "cuboid" ||
          (transformMode !== "translate" && transformMode !== "rotate"),
        actions: [
          {
            id: "world-space",
            label: "World Space",
            icon: <Typography variant="caption">W</Typography>,
            tooltip: "Transform in world space",
            isActive: transformSpace === "world",
            isVisible:
              currentArchetypeSelectedForTransform === "cuboid" ||
              currentArchetypeSelectedForTransform === "annotation-plane",
            onClick: () => handleTransformSpaceChange("world"),
          },
          {
            id: "local-space",
            label: "Local Space",
            icon: <Typography variant="caption">L</Typography>,
            tooltip: "Transform in local space",
            isActive: transformSpace === "local",
            isVisible:
              currentArchetypeSelectedForTransform === "cuboid" ||
              currentArchetypeSelectedForTransform === "annotation-plane",
            onClick: () => handleTransformSpaceChange("local"),
          },
        ],
      },
    ];

    if (
      (selectedPoint && currentArchetypeSelectedForTransform === "point") ||
      currentArchetypeSelectedForTransform === "annotation-plane"
    ) {
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
        customComponent:
          currentArchetypeSelectedForTransform === "annotation-plane" ? (
            <PlaneCoordinateInputs />
          ) : (
            <VertexCoordinateInputs />
          ),
      };

      baseActions.push({
        id: "coordinate-inputs",
        actions: [coordinateInputAction],
      });
    }

    return baseActions;
  }, [
    transformMode,
    currentArchetypeSelectedForTransform,
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
    isSnapToAnnotationPlane,
    setIsSnapToAnnotationPlane,
  ]);

  return {
    actions,
    transformMode,
    transformSpace,
  };
};
