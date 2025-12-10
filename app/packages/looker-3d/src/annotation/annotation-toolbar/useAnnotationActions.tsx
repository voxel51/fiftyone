import useConfirmExit from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Confirmation/useConfirmExit";
import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import * as fos from "@fiftyone/state";
import { Close, Delete, Edit, OpenWith, Straighten } from "@mui/icons-material";
import AddBoxIcon from "@mui/icons-material/AddBox";
import RectangleIcon from "@mui/icons-material/Rectangle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import PolylineIcon from "@mui/icons-material/Timeline";
import { Typography } from "@mui/material";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../../fo3d/context";
import {
  activeSegmentationStateAtom,
  annotationPlaneAtom,
  currentActiveAnnotationField3dAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  isCuboidAnnotateActiveAtom,
  isPolylineAnnotateActiveAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  snapCloseAutomaticallyAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
  transformModeAtom,
} from "../../state";
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
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [
    currentArchetypeSelectedForTransform,
    setCurrentArchetypeSelectedForTransform,
  ] = useRecoilState(currentArchetypeSelectedForTransformAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const isCuboidAnnotateActive = useRecoilValue(isCuboidAnnotateActiveAtom);
  const isPolylineAnnotateActive = useRecoilValue(isPolylineAnnotateActiveAtom);
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const [segmentState, setSegmentState] = useRecoilState(
    activeSegmentationStateAtom
  );
  const [snapCloseAutomatically, setSnapCloseAutomatically] = useRecoilState(
    snapCloseAutomaticallyAtom
  );
  const [editing, setEditing] = useAtom(editingAtom);
  const [editSegmentsMode, setEditSegmentsMode] =
    useRecoilState(editSegmentsModeAtom);
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
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

    setStagedPolylineTransforms((prev) => {
      const currentData = prev[labelId];
      if (!currentData) return prev;

      const currentSegments = currentData.segments || [];

      // If the segment doesn't exist or the point doesn't exist, return unchanged
      if (
        segmentIndex >= currentSegments.length ||
        pointIndex >= currentSegments[segmentIndex]?.points.length
      ) {
        return prev;
      }

      // Create new segments array with the point removed
      const newSegments = currentSegments.map((segment, segIdx) => {
        if (segIdx === segmentIndex) {
          // Remove the point from this segment
          const newPoints = segment.points.filter(
            (_, ptIdx) => ptIdx !== pointIndex
          );
          return { points: newPoints };
        }
        return segment;
      });

      // Remove empty segments
      const filteredSegments = newSegments.filter(
        (segment) => segment.points.length > 0
      );

      return {
        ...prev,
        [labelId]: {
          ...currentData,
          segments: filteredSegments,
        },
      };
    });

    setSelectedPoint(null);
    setCurrentArchetypeSelectedForTransform(null);
  }, [
    currentSampleId,
    currentActiveField,
    selectedPoint,
    setStagedPolylineTransforms,
    setSelectedPoint,
    setCurrentArchetypeSelectedForTransform,
  ]);

  const handleContextualDelete = useCallback(() => {
    if (selectedPoint) {
      handleDeleteSelectedPoint();
    } else if (
      selectedLabelForAnnotation &&
      selectedLabelForAnnotation._cls === "Polyline"
    ) {
      // Note: we're disabling this for now until auto-save
      // handleDeleteEntireTransform();
    }
  }, [selectedPoint, handleDeleteSelectedPoint, selectedLabelForAnnotation]);

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

  // Custom exit function that also clears polyline and cuboid transforms
  const customExit = useCallback(() => {
    setStagedPolylineTransforms({});
    setStagedCuboidTransforms({});
    setSelectedLabelForAnnotation(null);
    setEditing(null);
    setEditSegmentsMode(false);
  }, [
    setStagedPolylineTransforms,
    setStagedCuboidTransforms,
    setSelectedLabelForAnnotation,
    setEditing,
    setEditSegmentsMode,
  ]);

  // Use confirm exit hook with custom exit function
  const { confirmExit } = useConfirmExit(customExit);

  const handleDeselectLabel = useCallback(() => {
    confirmExit(() => {
      // Callback after exit is confirmed, no-op for now
    });
  }, [confirmExit]);

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
            onClick: handleDeselectLabel,
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
              : "Click in the 3D scene to create a unit cuboid",
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
            tooltip: "Delete selected polyline point",
            isActive: false,
            isVisible:
              currentArchetypeSelectedForTransform === "point" &&
              selectedPoint !== null,
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
              currentArchetypeSelectedForTransform === "annotation-plane",
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
    handleDeselectLabel,
  ]);

  return {
    actions,
    transformMode,
  };
};
