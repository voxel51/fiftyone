import useConfirmExit from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Confirmation/useConfirmExit";
import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import * as fos from "@fiftyone/state";
import { Close, Delete, Edit, OpenWith, Straighten } from "@mui/icons-material";
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
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  snapCloseAutomaticallyAtom,
  transformModeAtom,
  transformSpaceAtom,
} from "../../state";
import type {
  AnnotationAction,
  AnnotationActionGroup,
  TransformMode,
  TransformSpace,
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
  const [transformSpace, setTransformSpace] =
    useRecoilState(transformSpaceAtom);
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const [segmentState, setSegmentState] = useRecoilState(
    activeSegmentationStateAtom
  );
  const [snapCloseAutomatically, setSnapCloseAutomatically] = useRecoilState(
    snapCloseAutomaticallyAtom
  );
  const [editing, setEditing] = useAtom(editingAtom);
  const [editSegmentsMode, setEditSegmentsMode] =
    useRecoilState(editSegmentsModeAtom);
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

    setPolylinePointTransforms((prev) => {
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
    setPolylinePointTransforms,
    setSelectedPoint,
    setCurrentArchetypeSelectedForTransform,
  ]);

  const handleDeleteEntireTransform = useCallback(() => {
    if (
      !selectedLabelForAnnotation ||
      selectedLabelForAnnotation._cls !== "Polyline"
    )
      return;

    const labelId = selectedLabelForAnnotation._id;

    setPolylinePointTransforms((prev) => {
      const newTransforms = { ...prev };
      delete newTransforms[labelId];
      return newTransforms;
    });

    setSelectedLabelForAnnotation(null);
    setCurrentArchetypeSelectedForTransform(null);
    setSelectedPoint(null);
  }, [
    selectedLabelForAnnotation,
    setPolylinePointTransforms,
    setSelectedLabelForAnnotation,
    setCurrentArchetypeSelectedForTransform,
    setSelectedPoint,
  ]);

  const handleContextualDelete = useCallback(() => {
    if (selectedPoint) {
      handleDeleteSelectedPoint();
    } else if (
      selectedLabelForAnnotation &&
      selectedLabelForAnnotation._cls === "Polyline"
    ) {
      handleDeleteEntireTransform();
    }
  }, [
    selectedPoint,
    handleDeleteSelectedPoint,
    selectedLabelForAnnotation,
    handleDeleteEntireTransform,
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
  }, [annotationPlane.enabled, sceneBoundingBox, upVector]);

  const handleToggleEditSegmentsMode = useCallback(() => {
    setEditSegmentsMode(!editSegmentsMode);
    // Deactivate other modes when entering edit segments mode
    if (!editSegmentsMode) {
      setSegmentState((prev) => ({ ...prev, isActive: false }));
    }
  }, [editSegmentsMode, setEditSegmentsMode, setSegmentState]);

  // Custom exit function that also clears polyline transforms
  const customExit = useCallback(() => {
    setPolylinePointTransforms(null);
    setSelectedLabelForAnnotation(null);
    setEditing(null);
    setEditSegmentsMode(false);
  }, []);

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
            id: "contextual-delete",
            label: "Delete",
            icon: <Delete />,
            shortcut: "Delete",
            tooltip: selectedPoint
              ? "Delete selected polyline point"
              : "Delete polyline",
            isActive: false,
            isVisible:
              selectedLabelForAnnotation !== null &&
              selectedLabelForAnnotation._cls === "Polyline",
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
    transformSpace,
    handleContextualDelete,
    handleTransformSpaceChange,
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
    transformSpace,
  };
};
