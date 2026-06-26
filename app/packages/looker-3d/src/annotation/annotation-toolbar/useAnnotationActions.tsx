import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import useExit from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useExit";
import {
  KnownContexts,
  useKeyBindings,
  type KeyBinding,
} from "@fiftyone/commands";
import { Close, Delete, Edit, OpenWith, Straighten } from "@mui/icons-material";
import AddBoxIcon from "@mui/icons-material/AddBox";
import RectangleIcon from "@mui/icons-material/Rectangle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import PolylineIcon from "@mui/icons-material/Timeline";
import { Typography } from "@mui/material";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../../fo3d/context";
import {
  activeSegmentationStateAtom,
  annotationPlaneAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  isActivelySegmentingSelector,
  isCreatingCuboidAtom,
  selectedLabelForAnnotationAtom,
  selectedPolylineVertexAtom,
  snapCloseAutomaticallyAtom,
  transformModeAtom,
} from "../../state";
import {
  useCurrent3dAnnotationMode,
  useResetSelected3dAnnotationLabel,
} from "../../state/accessors";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../../types";
import {
  useCuboidOperations,
  usePolylineOperations,
  useWorkingDoc,
} from "../store";
import {
  canTransformArchetypeUseMode,
  getSelectedTransformArchetype,
} from "../transform-shortcuts";
import type { ToolbarActionGroup, TransformMode } from "../types";
import { AnnotationPlaneTooltip } from "./AnnotationPlaneTooltip";
import {
  PlaneCoordinateInputs,
  VertexCoordinateInputs,
} from "./CoordinateInputs";
import { FieldSelection } from "./FieldSelection";

const createCoordinateAction = (customComponent: React.ReactNode) => ({
  id: "coordinate-inputs",
  actions: [
    {
      id: "coordinate-inputs-component",
      label: "Coordinates",
      icon: <Typography variant="caption">XYZ</Typography>,
      tooltip: "Edit coordinates",
      isActive: false,
      isDisabled: false,
      isVisible: true,
      onClick: () => {},
      customComponent,
    },
  ],
});

const TRANSFORM_SHORTCUT_PRIORITY = 100;
const ACTIVE_ESCAPE_SHORTCUT_PRIORITY = 300;
const SELECTED_VERTEX_ESCAPE_SHORTCUT_PRIORITY = 200;
const EXIT_EDIT_ESCAPE_SHORTCUT_PRIORITY = 100;

export const useAnnotationActions = () => {
  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom,
  );
  const [
    currentArchetypeSelectedForTransform,
    setCurrentArchetypeSelectedForTransform,
  ] = useRecoilState(currentArchetypeSelectedForTransformAtom);
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom,
  );
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const isCuboidAnnotateActive = current3dAnnotationMode === "cuboid";
  const isPolylineAnnotateActive = current3dAnnotationMode === "polyline";
  const [isCreatingCuboid, setIsCreatingCuboid] =
    useRecoilState(isCreatingCuboidAtom);
  const [segmentState, setSegmentState] = useRecoilState(
    activeSegmentationStateAtom,
  );
  const [snapCloseAutomatically, setSnapCloseAutomatically] = useRecoilState(
    snapCloseAutomaticallyAtom,
  );
  const editing = useAnnotationContext().isEditing;
  const [editSegmentsMode, setEditSegmentsMode] =
    useRecoilState(editSegmentsModeAtom);
  const [annotationPlane, setAnnotationPlane] =
    useRecoilState(annotationPlaneAtom);
  const { sceneBoundingBox, upVector } = useFo3dContext();
  const { deleteCuboid } = useCuboidOperations();
  const { deletePolyline, updatePolylinePoints } = usePolylineOperations();
  const workingDoc = useWorkingDoc();
  const resetSelectedLabel = useResetSelected3dAnnotationLabel();

  const transformActionArchetype = getSelectedTransformArchetype({
    currentArchetypeSelectedForTransform,
    isAnnotationPlaneEnabled: annotationPlane.enabled,
    selectedLabelForAnnotation,
    selectedPoint,
  });

  const handleTransformModeChange = useCallback(
    (mode: TransformMode) => {
      if (!canTransformArchetypeUseMode(transformActionArchetype, mode)) {
        return;
      }

      if (currentArchetypeSelectedForTransform !== transformActionArchetype) {
        setCurrentArchetypeSelectedForTransform(transformActionArchetype);
      }

      setTransformMode(mode);
    },
    [
      currentArchetypeSelectedForTransform,
      transformActionArchetype,
      setCurrentArchetypeSelectedForTransform,
      setTransformMode,
    ],
  );

  const canUseTransformShortcut = useCallback(
    (mode: TransformMode) => {
      return (
        canTransformArchetypeUseMode(transformActionArchetype, mode) &&
        !isActivelySegmenting &&
        !isCreatingCuboid
      );
    },
    [transformActionArchetype, isActivelySegmenting, isCreatingCuboid],
  );

  const transformKeyBindings = useMemo<KeyBinding[]>(
    () => [
      {
        commandId: "looker-3d.annotation.transform.translate",
        sequence: "t",
        handler: () => handleTransformModeChange("translate"),
        label: "Translate selected 3D object",
        description: "Switch selected 3D object to translate mode.",
        enablement: () => canUseTransformShortcut("translate"),
        priority: TRANSFORM_SHORTCUT_PRIORITY,
      },
      {
        commandId: "looker-3d.annotation.transform.scale",
        sequence: "s",
        handler: () => handleTransformModeChange("scale"),
        label: "Scale selected 3D object",
        description: "Switch selected 3D object to scale mode.",
        enablement: () => canUseTransformShortcut("scale"),
        priority: TRANSFORM_SHORTCUT_PRIORITY,
      },
      {
        commandId: "looker-3d.annotation.transform.rotate",
        sequence: "r",
        handler: () => handleTransformModeChange("rotate"),
        label: "Rotate selected 3D object",
        description: "Switch selected 3D object to rotate mode.",
        enablement: () => canUseTransformShortcut("rotate"),
        priority: TRANSFORM_SHORTCUT_PRIORITY,
      },
    ],
    [canUseTransformShortcut, handleTransformModeChange],
  );

  useKeyBindings(KnownContexts.ModalAnnotate, transformKeyBindings, [
    transformKeyBindings,
  ]);

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

  const handleCancelCreateCuboid = useCallback(() => {
    setIsCreatingCuboid(false);
  }, [setIsCreatingCuboid]);

  const handleClearSelectedPoint = useCallback(() => {
    setSelectedPoint(null);
    setCurrentArchetypeSelectedForTransform(null);
  }, [setCurrentArchetypeSelectedForTransform, setSelectedPoint]);

  const canExitEditModeWithEscape = useCallback(() => {
    return (
      !isActivelySegmenting &&
      !isCreatingCuboid &&
      selectedPoint === null &&
      (selectedLabelForAnnotation !== null || editing)
    );
  }, [
    editing,
    isActivelySegmenting,
    isCreatingCuboid,
    selectedLabelForAnnotation,
    selectedPoint,
  ]);

  const onExit = useExit();

  const escapeKeyBindings = useMemo<KeyBinding[]>(
    () => [
      {
        commandId: "looker-3d.annotation.escape.cancel-segment",
        sequence: "escape",
        handler: handleCancelSegmentPolyline,
        label: "Cancel polyline segment",
        enablement: () => isPolylineAnnotateActive && isActivelySegmenting,
        priority: ACTIVE_ESCAPE_SHORTCUT_PRIORITY,
      },
      {
        commandId: "looker-3d.annotation.escape.cancel-cuboid-create",
        sequence: "escape",
        handler: handleCancelCreateCuboid,
        label: "Cancel cuboid creation",
        enablement: () => isCuboidAnnotateActive && isCreatingCuboid,
        priority: ACTIVE_ESCAPE_SHORTCUT_PRIORITY,
      },
      {
        commandId: "looker-3d.annotation.escape.clear-selected-vertex",
        sequence: "escape",
        handler: handleClearSelectedPoint,
        label: "Deselect polyline vertex",
        enablement: () =>
          !isActivelySegmenting && !isCreatingCuboid && selectedPoint !== null,
        priority: SELECTED_VERTEX_ESCAPE_SHORTCUT_PRIORITY,
      },
      {
        commandId: "looker-3d.annotation.escape.exit-edit-mode",
        sequence: "escape",
        handler: onExit,
        label: "Exit edit mode and deselect label",
        enablement: canExitEditModeWithEscape,
        priority: EXIT_EDIT_ESCAPE_SHORTCUT_PRIORITY,
      },
    ],
    [
      canExitEditModeWithEscape,
      handleCancelCreateCuboid,
      handleCancelSegmentPolyline,
      handleClearSelectedPoint,
      isActivelySegmenting,
      isCreatingCuboid,
      isCuboidAnnotateActive,
      isPolylineAnnotateActive,
      onExit,
      selectedPoint,
    ],
  );

  useKeyBindings(KnownContexts.ModalAnnotate, escapeKeyBindings, [
    escapeKeyBindings,
  ]);

  const handleDeleteSelectedPoint = useCallback(() => {
    if (!selectedPoint) return;

    const { labelId, segmentIndex, pointIndex } = selectedPoint;

    const workingLabel = workingDoc.labelsById[labelId];
    if (!workingLabel || !isPolyline3dOverlay(workingLabel)) return;

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
      if (isPolyline3dOverlay(selectedLabelForAnnotation)) {
        deletePolyline(selectedLabelForAnnotation._id);
      } else if (isDetection3dOverlay(selectedLabelForAnnotation)) {
        deleteCuboid(selectedLabelForAnnotation._id);
      }
      resetSelectedLabel();
    }
  }, [
    selectedPoint,
    handleDeleteSelectedPoint,
    selectedLabelForAnnotation,
    deletePolyline,
    deleteCuboid,
    resetSelectedLabel,
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

  const createCuboidKeyBindings = useMemo<KeyBinding[]>(
    () => [
      {
        commandId: "looker-3d.annotation.cuboid.toggle-create",
        sequence: "c",
        handler: handleToggleCreateCuboid,
        label: "Toggle cuboid create mode",
        description: "Enter or exit cuboid create mode.",
        enablement: () => isCuboidAnnotateActive,
        priority: TRANSFORM_SHORTCUT_PRIORITY,
      },
    ],
    [handleToggleCreateCuboid, isCuboidAnnotateActive],
  );

  useKeyBindings(KnownContexts.ModalAnnotate, createCuboidKeyBindings, [
    createCuboidKeyBindings,
  ]);

  const actions: ToolbarActionGroup[] = useMemo(() => {
    const baseActions: ToolbarActionGroup[] = [
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
            isVisible: selectedLabelForAnnotation !== null || editing,
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
            shortcut: "C",
            tooltip: isCreatingCuboid
              ? "Exit create mode (C)"
              : "Create a cuboid (C): first click to set the first corner, click again to set the orientation point, then click again to commit the width",
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
        isHidden: !transformActionArchetype,
        actions: [
          {
            id: "scale",
            label: "Scale",
            icon: <Straighten />,
            shortcut: "S",
            tooltip: "Scale object (S)",
            isActive: transformMode === "scale",
            isVisible: canTransformArchetypeUseMode(
              transformActionArchetype,
              "scale",
            ),
            onClick: () => handleTransformModeChange("scale"),
          },
          {
            id: "translate",
            label: "Translate",
            icon: <OpenWith />,
            shortcut: "T",
            tooltip: "Translate or move object (T)",
            isActive:
              !!transformActionArchetype && transformMode === "translate",
            isDisabled: !canTransformArchetypeUseMode(
              transformActionArchetype,
              "translate",
            ),
            onClick: () => handleTransformModeChange("translate"),
          },
          {
            id: "rotate",
            label: "Rotate",
            icon: <ThreeSixtyIcon />,
            shortcut: "R",
            tooltip: "Rotate object (R)",
            isVisible: canTransformArchetypeUseMode(
              transformActionArchetype,
              "rotate",
            ),
            isActive: transformMode === "rotate",
            onClick: () => handleTransformModeChange("rotate"),
          },
        ],
      },
    ];

    if (currentArchetypeSelectedForTransform === "annotation-plane") {
      baseActions.push(createCoordinateAction(<PlaneCoordinateInputs />));
    } else if (
      selectedPoint &&
      currentArchetypeSelectedForTransform === "point"
    ) {
      baseActions.push(createCoordinateAction(<VertexCoordinateInputs />));
    }

    return baseActions;
  }, [
    transformMode,
    currentArchetypeSelectedForTransform,
    transformActionArchetype,
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
    isCreatingCuboid,
    handleToggleCreateCuboid,
    onExit,
  ]);

  return {
    actions,
    transformMode,
  };
};
