import type useRefetchableSavedViews from "@fiftyone/core/src/hooks/useRefetchableSavedViews";
import type * as fop from "@fiftyone/playback";
import { ColorSchemeInput } from "@fiftyone/relay";
import {
  SpaceNode,
  SpaceTree,
  useInitializePanel,
  usePanels,
  usePanelTitle,
  useSetPanelStateById,
  PanelsStateObject,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { RecoilState, SetterOrUpdater } from "recoil";
import type { useRefreshOperators } from "../loader";
import { ExecutionContext as EC } from "../operators";
import type { useOperatorExecutor, useShowOperatorIO } from "../state";
import type { Property } from "../types";
import type usePanelEvent from "../usePanelEvent";

/*
 * Common
 */

export type DataObject = Record<string, unknown>;

export type ExecutionContext<PARAMS = DataObject, HOOKS = DataObject> = EC & {
  params: PARAMS;
  hooks: HOOKS;
};

/** The value type held by a Recoil atom, for typing its setter hooks. */
type RecoilStateValue<T> = T extends RecoilState<infer V> ? V : never;

export type OperatorExecutorType = ReturnType<typeof useOperatorExecutor>;

/*
 * Plugins
 */

export type ReloadDatasetHooks = {
  refresh: ReturnType<typeof fos.useRefresh>;
};

export type ReloadPluginsHooks = {
  refreshOperators: ReturnType<typeof useRefreshOperators>;
  datasetName: RecoilStateValue<typeof fos.datasetName>;
};

/*
 * ColorScheme
 */

export type SetColorSchemeParams = {
  color_by?: string;
  color_pool?: string[];
  color_scheme?: Record<string, unknown>;
  color_pool_preset?: "default" | "color-blind-friendly";
  default_mask_targets_colors?: Array<{ intTarget: number; color: string }>;
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
  layout?: "horizontal" | "vertical";
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
  panelsState: PanelsStateObject;
};

export type GetPanelStateParams = {
  id?: string;
  name?: string;
};

export type GetPanelDataHooks = {
  openedPanels: SpaceNode[];
  panelsData: PanelsStateObject;
};

export type GetPanelDataParams = {
  id?: string;
  name?: string;
};

export type OpenAllPanelsHooks = {
  availablePanels: AvailablePanelType;
  openedPanels: SpaceNode[];
  openPanelOperator: OperatorExecutorType;
};

export type ClosePanelHooks = {
  openedPanels: SpaceNode[];
  spaces: SpaceTree;
};

export type ClosePanelParams = {
  id?: string;
  name?: string;
};

export type CloseAllPanelsHooks = {
  openedPanels: SpaceNode[];
  closePanel: OperatorExecutorType;
};

export type SplitPanelHooks = {
  openedPanels: SpaceNode[];
  spaces: SpaceTree;
};

export type SplitPanelParams = {
  layout: "horizontal" | "vertical";
  name: string;
};

export type SetSpacesHooks = {
  setSessionSpacesState: SetterOrUpdater<
    RecoilStateValue<typeof fos.sessionSpaces>
  >;
};

export type SetSpacesParams = {
  name?: string;
  spaces?: RecoilStateValue<typeof fos.sessionSpaces>;
};

export type UpdatePanelStatePartialOptions = {
  targetPartial?: string;
  targetParam?: string;
  patch?: boolean;
  clear?: boolean;
  deepMerge?: boolean;
  set?: boolean;
};

export type PanelStateParams = Record<string, unknown> & {
  fullMerge?: boolean;
  full_merge?: boolean;
};

export type UpdatePanelStatePartialFn = (
  ctx: ExecutionContext<PanelStateParams>,
  options: UpdatePanelStatePartialOptions,
) => void;

export type UpdatePanelStateHooks = {
  updatePanelState: UpdatePanelStatePartialFn;
};

export type ReducePanelStateHooks = {
  setPanelStateById: ReturnType<typeof useSetPanelStateById>;
};

export type ReducePanelStateParams = {
  reducer: string;
};

export type SetPanelTitleHooks = {
  setTitle: ReturnType<typeof usePanelTitle>[1];
};

export type SetPanelTitleParams = {
  id: string;
  title: string;
};

export type ApplyPanelStatePathParams = {
  panel_id: string;
  path: string;
};

export type PromptUserForOperationHooks = {
  triggerEvent: ReturnType<typeof usePanelEvent>;
};

export type PromptUserForOperationParams = {
  operator_uri: string;
  params?: Record<string, unknown>;
  on_success?: string;
  on_error?: string;
  skip_prompt?: boolean;
};

/**
 * Dataset
 */

export type OpenDatasetHooks = {
  setDataset: ReturnType<typeof fos.useSetDataset>;
};

export type OpenDatasetParams = {
  dataset?: string;
};

export type DatasetHooks = {
  dataset: fos.State.Dataset;
};

export type ListBrainRunsParams = {
  type: "visualization" | "similarity";
};

/**
 * Sample
 */

export type OpenSampleHooks = {
  setExpanded: ReturnType<typeof fos.useSetExpandedSample>;
  activateAnnotateMode: () => void;
  activateExploreMode: () => void;
};

export type OpenSampleParams = {
  id: string;
  group_id?: string;
  mode?: "explore" | "annotate";
};

export type CloseSampleHooks = {
  close: ReturnType<typeof fos.useClearModal>;
};

/**
 * View and selection
 */

export type ResetExtendedSelectionHooks = {
  resetExtended: ReturnType<typeof fos.useResetExtendedSelection>;
};

export type SetSelectedSamplesHooks = {
  setSelected: ReturnType<typeof fos.useSetSelected>;
};

export type SetSelectedSamplesParams = {
  samples?: Array<string | { id: string; type?: fos.SelectionType }>;
};

export type SetViewHooks = {
  refetchableSavedViews: ReturnType<typeof useRefetchableSavedViews>;
  setView: ReturnType<typeof fos.useSetView>;
  setViewName: SetterOrUpdater<RecoilStateValue<typeof fos.viewName>>;
};

export type SetViewParams = {
  name?: string;
  view?: RecoilStateValue<typeof fos.view>;
};

export type ShowSamplesHooks = {
  setView: ReturnType<typeof fos.useSetView>;
};

export type ShowSamplesParams = {
  samples?: string[];
  use_extended_selection?: boolean;
};

export type SetSelectedLabelsHooks = {
  setSelected: ReturnType<typeof fos.useSetSelectedLabels>;
};

/** Accepts both the camelCase and snake_case key spellings. */
export type SetSelectedLabelsParams = {
  labels?: Array<{
    field: string;
    sampleId?: string;
    sample_id?: string;
    labelId?: string;
    label_id?: string;
    frameNumber?: number;
    frame_number?: number;
  }>;
};

export type SetExtendedSelectionHooks = {
  setExtendedSelection: SetterOrUpdater<
    RecoilStateValue<typeof fos.extendedSelection>
  >;
  clearExtendedSelection: SetterOrUpdater<
    RecoilStateValue<typeof fos.extendedSelection>
  >;
  resetExtendedSelection: ReturnType<typeof fos.useResetExtendedSelection>;
};

export type SetExtendedSelectionParams = {
  selection?: string[];
  scope?: string;
  clear?: boolean;
  reset?: boolean;
};

export type SetGroupSliceHooks = {
  setSlice: ReturnType<typeof fos.useSetGroupSlice>;
};

export type SetGroupSliceParams = {
  slice: string;
};

export type DisableQueryPerformanceHooks = {
  disable: ReturnType<typeof fos.useQueryPerformance>["disable"];
};

export type EnableQueryPerformanceHooks = {
  enable: ReturnType<typeof fos.useQueryPerformance>["enable"];
};

/**
 * Sidebar
 */

export type ShowSidebarHooks = {
  show: () => void;
};

export type HideSidebarHooks = {
  hide: () => void;
};

export type ToggleSidebarHooks = {
  toggle: () => void;
};

export type SetActiveFieldsHooks = {
  setActiveFields: (fields: string[]) => void;
};

export type SetActiveFieldsParams = {
  fields: string[];
};

export type ClearActiveFieldsHooks = {
  clearActiveFields: () => Promise<void>;
};

export type SetFiltersHooks = {
  setFilters: SetterOrUpdater<fos.State.Filters>;
};

export type SetFiltersParams = fos.State.Filters;

/**
 * Analytics
 */

export type TrackEventParams = {
  event: string;
  properties?: Record<string, unknown>;
};

export type TrackEventHooks = {
  trackEvent: (event: string, properties?: Record<string, unknown>) => void;
};

/*
 * Operator IO
 */

export type ShowOperatorIOHooks = {
  io: ReturnType<typeof useShowOperatorIO>;
};

export type ConsoleLogParams = {
  message?: string;
};

export type ShowOutputParams = {
  outputs: Parameters<typeof Property.fromJSON>[0];
  results: Record<string, unknown>;
};

export type SetProgressParams = {
  label?: string;
  variant?: "linear" | "circular";
  progress?: number;
};

export type TestOperatorParams = {
  operator: string;
  raw_params: string;
};

export type NotifyHooks = {
  notify: ReturnType<typeof fos.useNotification>;
};

export type NotifyParams = {
  message: string;
  variant?: "info" | "success" | "warning" | "error";
};

export type BrowserDownloadParams = {
  url: string;
  filename?: string;
};

/*
 * Playback
 */

export type SetPlayheadStateHooks = {
  setPlayheadState: (state: fop.PlayheadState, timeline_name?: string) => void;
};

export type SetPlayheadStateParams = {
  state: fop.PlayheadState;
  timeline_name?: string;
};

export type SetFrameNumberParams = {
  timeline_name?: string;
  frame_number: number;
};
