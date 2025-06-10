import { ColorscaleInput } from "@fiftyone/looker/src/state";
import { Vector3 } from "three";
import type { ShadeBy } from "./types";

export const ACTION_GRID = "grid";
export const ACTION_SHADE_BY = "shadeBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";
export const ACTION_SET_PCDS = "setPcds";
export const ACTION_SET_TOP_VIEW = "setTopView";
export const ACTION_SET_EGO_VIEW = "setEgoView";
export const ACTION_TOGGLE_BACKGROUND = "toggleFo3dBackground";
export const ACTION_VIEW_JSON = "json";
export const ACTION_VIEW_HELP = "help";

export const SET_TOP_VIEW_EVENT = "fo-action-set-top-view";
export const SET_EGO_VIEW_EVENT = "fo-action-set-ego-view";

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

export const PANEL_ORDER_VISIBILITY = -1;
export const PANEL_ORDER_ANIMATIONS = 1;
export const PANEL_ORDER_PCD_CONTROLS = 1;
export const PANEL_ORDER_LABELS = 998;
export const PANEL_ORDER_SCENE_CONTROLS = 999;
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

export const DEFAULT_PCD_SHADING_GRADIENTS_RED_TO_BLUE: ColorscaleInput["list"] =
  [
    // reddish
    { value: 0, color: "#a50026" },
    { value: 0.111, color: "#d73027" },
    { value: 0.222, color: "#f46d43" },
    { value: 0.333, color: "#fdae61" },
    { value: 0.444, color: "#fee090" },
    { value: 0.555, color: "#e0f3f8" },
    { value: 0.666, color: "#abd9e9" },
    { value: 0.777, color: "#74add1" },
    { value: 0.888, color: "#4575b4" },
    // blueish
    { value: 1, color: "#313695" },
  ];

// peach color, a mix of orange and white
export const LABEL_3D_HOVERED_AND_SELECTED_COLOR = "#de7e5d";
export const LABEL_3D_HOVERED_COLOR = "#f2f0ef";
export const LABEL_3D_INSTANCE_HOVERED_COLOR = "#ffffff";
export const LABEL_3D_SIMILAR_SELECTED_COLOR = "#ffa500";

// ray casting for points
export const RAY_CASTING_SENSITIVITY = {
  high: 0.001,
  medium: 0.1,
  low: 0.25,
};
