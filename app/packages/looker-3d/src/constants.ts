import { ShadeBy } from "./types";

export const ACTION_GRID = "grid";
export const ACTION_SHADE_BY = "shadeBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";
export const ACTION_SET_PCDS = "setPcds";
export const ACTION_SET_TOP_VIEW = "setTopView";
export const ACTION_SET_EGO_VIEW = "setEgoView";
export const ACTION_VIEW_JSON = "json";
export const ACTION_VIEW_HELP = "help";

export const SHADE_BY_INTENSITY = "intensity";
export const SHADE_BY_HEIGHT = "height";
export const SHADE_BY_RGB = "rgb";
export const SHADE_BY_CUSTOM = "custom";
export const SHADE_BY_NONE = "none";

export const ACTIONS = [
  { label: "Color By", value: ACTION_SHADE_BY },
  { label: "Set Point Size", value: ACTION_SET_POINT_SIZE },
  { label: "Set PCDs", value: ACTION_SET_PCDS },
  { label: "View Json", value: ACTION_VIEW_JSON },
];

export const SHADE_BY_CHOICES: { label: string; value: ShadeBy }[] = [
  { label: "Height", value: SHADE_BY_HEIGHT },
  { label: "Intensity", value: SHADE_BY_INTENSITY },
  { label: "RGB", value: SHADE_BY_RGB },
  { label: "Custom", value: SHADE_BY_CUSTOM },
  { label: "None", value: SHADE_BY_NONE },
];

export const VOXEL51_THEME_COLOR = "#ff6f00";
export const VOXEL51_THEME_COLOR_MUTED = "#A28A77";
export const VOXEL51_COMPLEMENTARY_COLOR = "#63E6F7";
