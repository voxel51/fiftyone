import type {
  ACTION_SET_PCDS,
  ACTION_SET_POINT_SIZE,
  ACTION_SHADE_BY,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "./constants";

export type Actions =
  | typeof ACTION_SHADE_BY
  | typeof ACTION_SET_POINT_SIZE
  | typeof ACTION_SET_PCDS
  | typeof ACTION_VIEW_JSON
  | typeof ACTION_VIEW_HELP;

export type ShadeBy =
  | typeof SHADE_BY_INTENSITY
  | typeof SHADE_BY_HEIGHT
  | typeof SHADE_BY_RGB
  | typeof SHADE_BY_CUSTOM
  | typeof SHADE_BY_NONE
  | string;

export type HoverMetadata = {
  assetName: string;
  attributes?: Record<string, string | number | boolean>;
  renderModeDescriptor?: string;
};

export type NodeName = string;

export type VisibilityMap = Record<NodeName, boolean>;

export type NodeUuid = string;

export type AssetLoadingLog = {
  message: string;
  status: "info" | "success" | "error";
};
