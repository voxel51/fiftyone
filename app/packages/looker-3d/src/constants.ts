import { Vector3 } from "three";
import { ShadeBy } from "./types";
import { Gradients } from "./renderables/pcd/shaders";

export const ACTION_GRID = "grid";
export const ACTION_SHADE_BY = "shadeBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";
export const ACTION_SET_PCDS = "setPcds";
export const ACTION_SET_TOP_VIEW = "setTopView";
export const ACTION_SET_EGO_VIEW = "setEgoView";
export const ACTION_TOGGLE_BACKGROUND = "toggleFo3dBackground";
export const ACTION_VIEW_JSON = "json";
export const ACTION_VIEW_HELP = "help";

export const SHADE_BY_INTENSITY = "intensity";
export const SHADE_BY_HEIGHT = "height";
export const SHADE_BY_RGB = "rgb";
export const SHADE_BY_CUSTOM = "custom";
export const SHADE_BY_NONE = "none";

export const DEFAULT_CAMERA_POSITION = () => new Vector3(0, 5, -5).clone();

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

export const PANEL_ORDER_VISIBILITY = 9;
export const PANEL_ORDER_PCD_CONTROLS = 1;
export const PANEL_ORDER_LIGHTS = 10;
export const PANEL_ORDER_ANIMATIONS = 3;
export const PANEL_ORDER_SETTINGS = 1000;

export const COLOR_POOL = [
  0x33ff57, // Bright Green
  0x50c878, // Emerald
  0xadff2f, // Green Yellow
  0xff5733, // Vibrant Red
  0xdc143c, // Crimson
  0xff69b4, // Hot Pink
  0x20b2aa, // Light Sea Green
  0xf4a460, // Sandy Brown
  0xcd853f, // Peru
  0xff7f50, // Coral
  0x708090, // Slate Gray
  0xf5f5dc, // Beige
];

export const PCD_SHADING_GRADIENTS: Gradients = [
  [0.0, "rgb(165,0,38)"],
  [0.111, "rgb(215,48,39)"],
  [0.222, "rgb(244,109,67)"],
  [0.333, "rgb(253,174,97)"],
  [0.444, "rgb(254,224,144)"],
  [0.555, "rgb(224,243,248)"],
  [0.666, "rgb(171,217,233)"],
  [0.777, "rgb(116,173,209)"],
  [0.888, "rgb(69,117,180)"],
  [1.0, "rgb(49,54,149)"],
];
