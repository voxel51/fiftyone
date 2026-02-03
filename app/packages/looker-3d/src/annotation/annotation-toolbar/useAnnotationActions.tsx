import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import useExit from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import { Close, Delete, Edit, OpenWith, Straighten } from "@mui/icons-material";
import AddBoxIcon from "@mui/icons-material/AddBox";
import RectangleIcon from "@mui/icons-material/Rectangle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import PolylineIcon from "@mui/icons-material/Timeline";
import { Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../../fo3d/context";
import {
  activeSegmentationStateAtom,
  annotationPlaneAtom,
  current3dAnnotationModeAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  snapCloseAutomaticallyAtom,
  transformModeAtom,
} from "../../state";
import { isDetectionOverlay, isPolylineOverlay } from "../../types";
import {
  useCuboidOperations,
  usePolylineOperations,
  useWorkingDoc,
} from "../store";
import type {
  AnnotationAction,
  AnnotationActionGroup,
  TransformMode,
} from "../types";
import { AnnotationPlaneTooltip } from "./AnnotationPlaneTooltip";
import {
  PlaneCoordinateInputs,
  VertexCoordinateInputs,
} from "./CoordinateInputs";
import { FieldSelection } from "./FieldSelection";

export const useAnnotationActions = () => {
  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom
  );
  const [
    currentArchetypeSelectedForTransform,
    setCurrentArchetypeSelectedForTransform,
  ] = useRecoilState(currentArchetypeSelectedForTransformAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isCuboidAnnotateActive = current3dAnnotationMode === "cuboid";
  const isPolylineAnnotateActive = current3dAnnotationMode === "polyline";
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const [segmentState, setSegmentState] = useRecoilState(
    activeSegmentationStateAtom
  );
  const [snapCloseAutomatically, setSnapCloseAutomatically] = useRecoilState(
    snapCloseAutomaticallyAtom
  );
  const editing = useAtomValue(editingAtom);
  const [editSegmentsMode, setEditSegmentsMode] =
    useRecoilState(editSegmentsModeAtom);
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const { sceneBoundingBox, upVector } = useFo3dContext();
  const { deleteCuboid } = useCuboidOperations();
  const { deletePolyline, updatePolylinePoints } = usePolylineOperations();
  const workingDoc = useWorkingDoc();

  const handleTransformModeChange = useCallback(
    (mode: TransformMode) => {
      setTransformMode(mode);
    },
    [setTransformMode]
  );

  const handleStartSegmentPolyline = useCallback(() => {
    setSegmentState({
      isActive: true,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
  }, [setSegmentState]);

  const handleCancelSegmentPolyline = useCallback(() => {
    setSegmentState({
      isActive: false,
      vertices: [],
      currentMousePosition: null,
      isClosed: false,
    });
  }, [setSegmentState]);

  const handleDeleteSelectedPoint = useCallback(() => {
    if (!selectedPoint) return;

    const { labelId, segmentIndex, pointIndex } = selectedPoint;

    const workingLabel = workingDoc.labelsById[labelId];
    if (!workingLabel || !isPolylineOverlay(workingLabel)) return;

    const points3d = workingLabel.points3d;
    if (!points3d) return;

    // If the segment doesn't exist or the point doesn't exist, return
    if (
      segmentIndex >= points3d.length ||
      pointIndex >= points3d[segmentIndex]?.length
    ) {
      return;
    }

    // Create new points3d array with the point removed
    const newPoints3d = points3d
      .map((segment, segIdx) => {
        if (segIdx === segmentIndex) {
          // Remove the point from this segment
          return segment.filter((_, ptIdx) => ptIdx !== pointIndex);
        }
        return segment;
      })
      // Remove empty segments
      .filter((segment) => segment.length > 0);

    updatePolylinePoints(labelId, newPoints3d);

    setSelectedPoint(null);
    setCurrentArchetypeSelectedForTransform(null);
  }, [
    selectedPoint,
    workingDoc,
    updatePolylinePoints,
    setSelectedPoint,
    setCurrentArchetypeSelectedForTransform,
  ]);

  const handleContextualDelete = useCallback(() => {
    if (selectedPoint) {
      handleDeleteSelectedPoint();
    } else if (selectedLabelForAnnotation) {
      if (isPolylineOverlay(selectedLabelForAnnotation)) {
        deletePolyline(selectedLabelForAnnotation._id);
      } else if (isDetectionOverlay(selectedLabelForAnnotation)) {
        deleteCuboid(selectedLabelForAnnotation._id);
      }
    }
  }, [
    selectedPoint,
    handleDeleteSelectedPoint,
    selectedLabelForAnnotation,
    deletePolyline,
    deleteCuboid,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (
        !isActivelySegmenting &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        handleContextualDelete();
      }
    };

    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [handleContextualDelete, isActivelySegmenting]);

  const handleToggleAnnotationPlane = useCallback(() => {
    if (!annotationPlane.enabled) {
      if (sceneBoundingBox && upVector) {
        const center = new THREE.Vector3(...annotationPlane.position);

        const quaternion = new THREE.Quaternion(...annotationPlane.quaternion);

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
  }, [
    annotationPlane.enabled,
    annotationPlane.position,
    annotationPlane.quaternion,
    sceneBoundingBox,
    upVector,
  ]);

  const handleToggleEditSegmentsMode = useCallback(() => {
    setEditSegmentsMode(!editSegmentsMode);
    // Deactivate other modes when entering edit segments mode
    if (!editSegmentsMode) {
      setSegmentState((prev) => ({ ...prev, isActive: false }));
    }
  }, [editSegmentsMode, setEditSegmentsMode, setSegmentState]);

  const handleToggleCreateCuboid = useCallback(() => {
    setIsCreatingCuboid(!isCreatingCuboid);
  }, [isCreatingCuboid, setIsCreatingCuboid]);

  const onExit = useExit();

  const actions: AnnotationActionGroup[] = useMemo(() => {
    const baseActions: AnnotationActionGroup[] = [
      {
        id: "edit-actions",
        label: "",
        actions: [
          {
            id: "field-selector",
            label: "Active Field",
            icon: <Typography variant="caption">F</Typography>,
            tooltip: "Select active annotation field",
            isActive: false,
            isDisabled: false,
            isVisible: true,
            onClick: () => {},
            customComponent: <FieldSelection />,
          },
          {
            id: "exit-edit-mode",
            label: "Deselect",
            icon: <Close />,
            shortcut: "Esc",
            tooltip: "Exit edit mode and deselect label",
            isActive: false,
            isVisible: selectedLabelForAnnotation !== null || editing !== null,
            onClick: onExit,
          },
        ],
      },
      {
        id: "polyline-actions",
        label: "Polyline",
        isHidden: !isPolylineAnnotateActive,
        actions: [
          {
            id: "new-segment",
            label: "New Segment",
            icon: <PolylineIcon sx={{ transform: "rotate(90deg)" }} />,
            // if label selected, add new segment to the label
            // if no label selected, create a new label
            tooltip: selectedLabelForAnnotation
              ? "Add new polyline segment to current polyline"
              : "Create new polyline",
            isActive: segmentState.isActive,
            onClick: segmentState.isActive
              ? handleCancelSegmentPolyline
              : handleStartSegmentPolyline,
          },
          {
            id: "edit-segments",
            label: "Edit Segments",
            icon: <Edit />,
            tooltip: "Click on a segment to add a new vertex",
            isActive: editSegmentsMode,
            isVisible: selectedLabelForAnnotation !== null,
            onClick: handleToggleEditSegmentsMode,
          },
          {
            id: "snap-close-automatically",
            label: "Snap Close Automatically",
            icon: <RestartAltIcon />,
            tooltip:
              "When enabled, double-clicking closes the polyline. When disabled, double-clicking ends the annotation and commits the last placed vertex.",
            isActive: snapCloseAutomatically,
            onClick: () => setSnapCloseAutomatically(!snapCloseAutomatically),
          },
        ],
      },
      {
        id: "cuboid-actions",
        label: "Cuboid",
        isHidden: !isCuboidAnnotateActive,
        actions: [
          {
            id: "create-cuboid",
            label: "Create Cuboid",
            icon: <AddBoxIcon />,
            tooltip: isCreatingCuboid
              ? "Exit create mode"
              : "First click to set the center position, then click again to set the orientation point, and finally click again to commit the width",
            isActive: isCreatingCuboid,
            onClick: handleToggleCreateCuboid,
          },
        ],
      },
      {
        id: "general-actions",
        label: "",
        actions: [
          {
            id: "contextual-delete",
            label: "Delete",
            icon: <Delete />,
            shortcut: "Delete",
            tooltip: selectedPoint
              ? "Delete selected polyline point"
              : "Delete selected label",
            isActive: false,
            isVisible:
              (currentArchetypeSelectedForTransform === "point" &&
                selectedPoint !== null) ||
              selectedLabelForAnnotation !== null,
            onClick: handleContextualDelete,
          },
          {
            id: "toggle-annotation-plane",
            label: "Annotation Plane",
            icon: <RectangleIcon />,
            tooltip: <AnnotationPlaneTooltip />,
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
            icon: <ThreeSixtyIcon />,
            tooltip: "Rotate object",
            isVisible:
              currentArchetypeSelectedForTransform === "annotation-plane" ||
              currentArchetypeSelectedForTransform === "cuboid",
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
    ];

    if (
      (selectedPoint && currentArchetypeSelectedForTransform === "point") ||
      currentArchetypeSelectedForTransform === "annotation-plane" ||
      currentArchetypeSelectedForTransform === "cuboid"
    ) {
      const coordinateInputAction: AnnotationAction = {
        id: "coordinate-inputs-component",
        label: "Coordinates",
        icon: <Typography variant="caption">XYZ</Typography>,
        tooltip: "Edit coordinates",
        isActive: false,
        isDisabled: false,
        isVisible: true,
        // No-op since this is a custom component
        onClick: () => {},
        customComponent:
          currentArchetypeSelectedForTransform === "annotation-plane" ? (
            <PlaneCoordinateInputs hideRotation={false} />
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
    handleContextualDelete,
    selectedLabelForAnnotation,
    selectedPoint,
    segmentState,
    annotationPlane,
    handleStartSegmentPolyline,
    handleCancelSegmentPolyline,
    handleToggleAnnotationPlane,
    snapCloseAutomatically,
    editSegmentsMode,
    handleToggleEditSegmentsMode,
    editing,
    isPolylineAnnotateActive,
    isCuboidAnnotateActive,
    onExit,
  ]);

  return {
    actions,
    transformMode,
  };
};
