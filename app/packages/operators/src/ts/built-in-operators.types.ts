import { ColorSchemeInput } from "@fiftyone/relay";
import {
  SpaceNode,
  SpaceTree,
  useInitializePanel,
  usePanels,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { SetterOrUpdater } from "recoil";
import { ExecutionContext as EC } from "../operators";

/*
 * Common
 */

export type DataObject = Record<string, unknown>;

export type ExecutionContext<PARAMS = DataObject, HOOKS = DataObject> = EC & {
  params: PARAMS;
  hooks: HOOKS;
};

/*
 * ColorScheme
 */

export type SetColorSchemeParams = {
  color_by?: string;
  color_pool?: string[];
  color_scheme?: Record<string, unknown>;
  color_pool_preset?: "default" | "color-blind-friendly";
  default_mask_targets_colors?: Array<{ initTarget: number; color: string }>;
  default_colorscale?: Array<{ value: number; color: string }>;
  default_colorscale_preset?: string;
  multi_color_keypoints?: boolean;
  opacity?: number;
  show_keypoint_skeletons?: boolean;
};

export type SetColorSchemeHooks = {
  setColorScheme: SetterOrUpdater<ColorSchemeInput>;
  defaultPool: readonly string[];
};

export type ResetColorSchemeHooks = {
  resetColorScheme: () => void;
};

/*
 * Spaces
 */

export type AvailablePanelType = ReturnType<typeof usePanels>;
export type InitializePanelType = ReturnType<typeof useInitializePanel>;

export type OpenPanelHooks = {
  availablePanels: AvailablePanelType;
  gridSpaces: SpaceTree;
  isModalOpen: boolean;
  modalSpaces: SpaceTree;
  openedGridPanels: SpaceNode[];
  openedModalPanels: SpaceNode[];
  initializePanel: InitializePanelType;
};

export type OpenPanelParams = {
  data?: Record<string, unknown>;
  force?: boolean;
  forceDuplicate?: boolean;
  isActive?: boolean;
  layout?: string;
  name: string;
  state?: Record<string, unknown>;
};

export type ListPanelsHooks = {
  panels: AvailablePanelType;
};

export type ListPanelsParams = {
  surface?: "grid" | "modal";
};

export type ListOpenPanelsHooks = {
  isModalOpen: boolean;
  openedGridPanels: SpaceNode[];
  openedModalPanels: SpaceNode[];
  panels: AvailablePanelType;
};

export type ListPanelItemType = {
  name: string;
  label?: string;
  panelOptions?: Record<string, unknown>;
};

export type ListOpenPanelsItemType = ListPanelItemType & {
  id?: string;
  pinned?: boolean;
};

export type GetPanelStateHooks = {
  openedPanels: SpaceNode[];
  panelsState: Map<string, unknown>;
};

export type GetPanelStateParams = {
  id?: string;
  name?: string;
};

export type GetPanelDataHooks = {
  openedPanels: SpaceNode[];
  panelsData: Map<string, unknown>;
};

export type GetPanelDataParams = {
  id?: string;
  name?: string;
};

/**
 * Dataset
 */

export type DatasetHooks = {
  dataset: fos.State.Dataset;
};

export type ListBrainRunsParams = {
  type: "visualization" | "similarity";
};
