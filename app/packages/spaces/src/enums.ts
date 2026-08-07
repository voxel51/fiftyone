// an enum for different layouts of a space
export enum Layout {
  Vertical = "vertical",
  Horizontal = "horizontal",
}

export enum SPACE_TYPES {
  PANEL_CONTAINER = "panel-container",
  EMPTY = "empty",
}

export enum PANEL_AREA {
  SIDEBAR_LEFT = "sidebar-left",
  SIDEBAR_RIGHT = "sidebar-right",
  BOTTOM_PANEL = "bottom-panel",
  GRID_SIDEBAR_RIGHT = SIDEBAR_RIGHT,
}

/** @deprecated Panel areas now render registered panels directly. */
export const SIDEBAR_PANEL_RENDERER_ID = "sidebar-right-panel-tabs";
