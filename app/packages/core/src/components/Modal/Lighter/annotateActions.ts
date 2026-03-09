/**
 * The looker package (@fiftyone/looker) defines the Control/ControlMap shape and
 * we want to preserve that shape in Lighter so we can use it to define shortcuts.
 *
 * However Lighter handles keyboard/mouse for annotate mode internally - this file helps
 * us map those internal actions to Controls so we can use them to document shortcuts.
 *
 * Shortcuts from: https://docs.google.com/spreadsheets/d/1lKVgTCEg67LucW_vlUHR_GIzjgXQgjBfNtxP1bZxB1k/edit?gid=968389650#gid=968389650
 */

import {
  json,
  readActions,
  resetZoom,
  selectSample,
} from "@fiftyone/looker/src/shared/actions";
import type {
  BaseState,
  Control,
  ControlMap,
} from "@fiftyone/looker/src/state";

/** Builds a looker Control with a no-op action for
 * annotate-mode entries whose behavior lives in lighter. */
const annotateNoOp = (
  title: string,
  detail: string,
  shortcut: string
): Control => ({
  title,
  shortcut,
  detail,
  action: () => null,
});

const navigateToPreviousNextSample = annotateNoOp(
  "Navigate to previous/next sample",
  "Switch between samples in the modal",
  "← / →"
);
const toggleFullscreen = annotateNoOp(
  "Toggle fullscreen",
  "Enter or exit fullscreen",
  "f"
);
const deleteLabelInstance = annotateNoOp(
  "Delete label instance",
  "Remove the selected label instance",
  "Del"
);
const undo = annotateNoOp("Undo", "Undo the last action", "Ctrl+Z / Cmd+Z");
const redo = annotateNoOp(
  "Redo",
  "Redo the last undone action",
  "Ctrl+Y / Cmd+Y"
);
const moveCameraToEgoView = annotateNoOp(
  "Move camera to ego view",
  "Align camera to ego view",
  "e"
);
const moveCameraToFrontBackView = annotateNoOp(
  "Move camera to front/back view",
  "Align camera to front or back",
  "3 / Ctrl+3 / Cmd+3"
);
const moveCameraToRightLeftView = annotateNoOp(
  "Move camera to right/left view",
  "Align camera to right or left",
  "2 / Ctrl+2 / Cmd+2"
);
const moveCameraToTopDownView = annotateNoOp(
  "Move camera to top-down view",
  "Align camera to top-down view",
  "t"
);
const moveCameraToTopBelowAnnotationPlane = annotateNoOp(
  "Move camera above/below annotation plane",
  "Position camera above or below the annotation plane",
  "4 / Ctrl+4 / Cmd+4"
);
const moveCameraToTopBottomView = annotateNoOp(
  "Move camera to top/bottom view",
  "Align camera to top or bottom",
  "1 / Ctrl+1 / Cmd+1"
);
const translateCamera = annotateNoOp(
  "Translate camera",
  "Pan the camera",
  "Shift+Click"
);
const toggleBackground = annotateNoOp(
  "Toggle background",
  "Show or hide the background",
  "b"
);
const toggleGrid = annotateNoOp("Toggle grid", "Show or hide the grid", "g");
const toggleRenderPreferences = annotateNoOp(
  "Toggle render preferences",
  "Show or hide render preferences panel",
  "r"
);
const toggleFo3dJsonView = annotateNoOp(
  "Toggle FO3D JSON view",
  "View or hide FO3D JSON",
  "i"
);
const zoomInOut = annotateNoOp(
  "Zoom in/out",
  "Zoom in or out on the sample",
  "Ctrl+Left drag / Wheel"
);

/**
 * Actions supported in Annotate mode from:
 * https://docs.google.com/spreadsheets/d/1lKVgTCEg67LucW_vlUHR_GIzjgXQgjBfNtxP1bZxB1k/edit?gid=968389650#gid=968389650
 * Each key is the action identifier; value is the associated control object.
 */
export const ANNOTATE: ControlMap<BaseState> = {
  navigateToPreviousNextSample,
  selectDeselectSample: selectSample, // re-use looker action
  toggleFullscreen,
  deleteLabelInstance,
  undo,
  redo,
  moveCameraToEgoView,
  moveCameraToFrontBackView,
  moveCameraToRightLeftView,
  moveCameraToTopDownView,
  moveCameraToTopBelowAnnotationPlane,
  moveCameraToTopBottomView,
  translateCamera,
  toggleBackground,
  toggleGrid,
  toggleRenderPreferences,
  toggleFoSampleJsonView: json, // re-use looker action
  toggleFo3dJsonView,
  zoomInOut,
  resetZoom,
};

export const ANNOTATE_SHORTCUTS = readActions(ANNOTATE);
