import {
  Add,
  Close,
  Delete,
  GridOn,
  OpenWith,
  RotateRight,
  Straighten,
} from "@mui/icons-material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Typography } from "@mui/material";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import * as THREE from "three";
import MagnetIcon from "../../assets/icons/magnet.svg?react";
import { useFo3dContext } from "../../fo3d/context";
import {
  annotationPlaneAtom,
  currentArchetypeSelectedForTransformAtom,
  isSnapToAnnotationPlaneAtom,
  polylinePointTransformsAtom,
  segmentPolylineStateAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  snapCloseAutomaticallyAtom,
  tempPolylinesAtom,
  transformModeAtom,
  transformSpaceAtom,
  type TransformMode,
  type TransformSpace,
} from "../../state";
import { getGridQuaternionFromUpVector } from "../../utils";
import { deletePolylinePoint } from "../utils/polyline-delete";
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
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const [segmentPolylineState, setSegmentPolylineState] = useRecoilState(
    segmentPolylineStateAtom
  );
  const [isSnapToAnnotationPlane, setIsSnapToAnnotationPlane] = useRecoilState(
    isSnapToAnnotationPlaneAtom
  );
  const [snapCloseAutomatically, setSnapCloseAutomatically] = useRecoilState(
    snapCloseAutomaticallyAtom
  );
  const [tempPolylines, setTempPolylines] = useRecoilState(tempPolylinesAtom);
  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );
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

  const handleDeleteSelectedPoint = useCallback(() => {
    if (!selectedPoint) return;

    const { labelId, segmentIndex, pointIndex } = selectedPoint;

    setPolylinePointTransforms((prev) => {
      const currentTransforms = prev[labelId] || [];
      const result = deletePolylinePoint(
        currentTransforms,
        segmentIndex,
        pointIndex
      );

      return {
        ...prev,
        [labelId]: result.newTransforms,
      };
    });

    setSelectedPoint(null);
    setCurrentArchetypeSelectedForTransform(null);
  }, [
    selectedPoint,
    setPolylinePointTransforms,
    setSelectedPoint,
    setCurrentArchetypeSelectedForTransform,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        handleDeleteSelectedPoint();
      }
    };

    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [handleDeleteSelectedPoint]);

  const handleToggleAnnotationPlane = useCallback(() => {
    if (!annotationPlane.enabled) {
      if (sceneBoundingBox && upVector) {
        const center = new THREE.Vector3(...annotationPlane.position);

        let quaternion = new THREE.Quaternion(...annotationPlane.quaternion);

        if (
          quaternion[0] === 0 &&
          quaternion[1] === 0 &&
          quaternion[2] === 0 &&
          quaternion[3] === 1
        ) {
          quaternion = getGridQuaternionFromUpVector(
            upVector,
            new THREE.Vector3(0, 0, 1)
          );
        }

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
                ? "Project new vertices to the annotation plane"
                : "Project new vertices to the annotation plane whether or not it is enabled",
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
          {
            id: "snap-close-automatically",
            label: "Snap Close Automatically",
            icon: <RestartAltIcon />,
            tooltip:
              "When enabled, double-click closes polylines. When disabled, double-click ends segment at click location.",
            isActive: snapCloseAutomatically,
            onClick: () => setSnapCloseAutomatically(!snapCloseAutomatically),
          },
          {
            id: "delete-selected-point",
            label: "Delete Point",
            icon: <Delete />,
            shortcut: "Delete",
            tooltip: "Delete selected polyline point",
            isActive: false,
            isVisible: selectedPoint !== null,
            isDisabled: selectedPoint === null,
            onClick: handleDeleteSelectedPoint,
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
    snapCloseAutomatically,
    setSnapCloseAutomatically,
  ]);

  return {
    actions,
    transformMode,
    transformSpace,
  };
};
