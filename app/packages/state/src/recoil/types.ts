import { CustomizeColorInput } from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";

export namespace State {
  export type MediaType =
    | "image"
    | "group"
    | "point_cloud"
    | "three_d"
    | "video";

  export enum SPACE {
    FRAME = "FRAME",
    SAMPLE = "SAMPLE",
  }

  /**
   * An object containing the configuration for plugins.
   * Each key is the name of a plugin, and the value is the
   * configuration for that plugin.
   */
  export type PluginConfig = { [pluginName: string]: object };

  export type DefaultVisibilityLabelsConfig = {
    include?: string[];
    exclude?: string[];
  };
  export interface Config {
    colorPool: string[];
    customizedColors: CustomizeColorInput[];
    colorscale: string;
    gridZoom: number;
    loopVideos: boolean;
    notebookHeight: number;
    plugins?: PluginConfig;
    showConfidence: boolean;
    showIndex: boolean;
    showLabel: boolean;
    showTooltip: boolean;
    timezone: string | null;
    theme: "browser" | "dark" | "light";
    useFrameNumber: boolean;
    mediaFields?: string[];
    mediaFallback: boolean;
  }

  export interface ID {
    $oid: string;
  }

  export interface DateTime {
    $date: number;
  }

  export interface Targets {
    [key: number]: string;
  }

  export interface SavedView {
    id: string;
    datasetId: string;
    name: string;
    description?: string;
    color?: string;
    slug: string;
    viewStages: Stage[];
    createdAt: DateTime;
    lastLoadedAt: DateTime;
    lastModifiedAt?: DateTime;
  }

  export interface Evaluation {}

  export interface Run {
    key: string;
    version: string;
    timestamp: string;
    config: {};
    viewStages: readonly string[];
  }

  export interface BrainRun extends Run {
    config: {
      embeddingsField: string | null;
      method: string;
      patchesField: string | null;
      cls: string;
      supportsPrompts: boolean | null;
      type: string | null;
      maxK: number | null;
      supportsLeastSimilarity: boolean | null;
    };
  }

  export interface EvaluationRun extends Run {
    config: {
      gtField: string;
      predField: string;
    };
  }

  export interface AnnotationRun extends Run {
    config: {};
  }

  export interface KeypointSkeleton {
    labels: string[];
    edges: number[][];
  }

  export interface StrictKeypointSkeleton extends KeypointSkeleton {
    name: string;
  }

  export interface SidebarGroup {
    expanded?: boolean;
    name: string;
    paths: string[];
  }

  export interface DynamicGroupParameters {
    groupBy: string;
    orderBy?: string;
  }

  export interface DatasetAppConfig {
    defaultVisibilityLabels?: DefaultVisibilityLabelsConfig;
    dynamicGroupsTargetFrameRate: number;
    gridMediaField?: string;
    modalMediaField?: string;
    mediaFields?: string[];
    plugins?: PluginConfig;
  }

  /**
   * The dataset object returned by the API.
   */
  export interface Dataset {
    id: string;
    brainMethods: BrainRun[];
    createdAt: DateTime;
    datasetId: string;
    defaultMaskTargets: Targets;
    evaluations: EvaluationRun[];
    lastLoadedAt: DateTime;
    maskTargets: {
      [key: string]: Targets;
    };
    groupSlice?: string;
    mediaType: MediaType;
    parentMediaType: MediaType;
    name: string;
    version: string;
    skeletons: StrictKeypointSkeleton[];
    defaultSkeleton?: KeypointSkeleton;
    groupMediaTypes?: {
      name: string;
      mediaType: MediaType;
    }[];
    groupField: string;
    appConfig: DatasetAppConfig;
    info: { [key: string]: string };
  }

  export interface SortBySimilarityParameters {
    brainKey: string;
    distField?: string;
    k?: number;
    reverse?: boolean;
    query?: string | string[];
    queryIds?: string[];
  }

  type FilterValues = string | boolean | number | null | undefined;

  export interface Filter {
    [key: string]: FilterValues | Array<FilterValues>;
  }

  export interface Filters {
    [key: string]: Filter;
  }

  export interface Stage {
    _cls: string;
    kwargs: [string, unknown][];
    _uuid?: string;
  }

  export interface SelectedLabelData {
    sampleId: string;
    field: string;
    frameNumber?: number;
  }

  export interface SelectedLabelMap {
    [labelId: string]: SelectedLabelData;
  }

  export interface SelectedLabel extends SelectedLabelData {
    labelId: string;
  }

  export interface FieldVisibilityStage {
    cls: string;
    kwargs: {
      field_names: string[];
    };
  }

  export interface Description {
    dataset: string;
    selected: string[];
    selectedLabels: SelectedLabel[];
    view: Stage[];
    viewCls: string | null;
    viewName: string | null;
    savedViewSlug: string | null;
    savedViews: SavedView[];
    spaces?: SpaceNodeJSON;
    fieldVisibilityStage?: FieldVisibilityStage;
  }
}
