import { SpaceNodeJSON } from "@fiftyone/spaces";
import { StrictField } from "@fiftyone/utilities";

export namespace State {
  export type MediaType = "image" | "group" | "point_cloud" | "video";

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
  export interface Config {
    colorPool: string[];
    customizedColors: CustomizeColor[];
    colorscale: string;
    gridZoom: number;
    loopVideos: boolean;
    notebookHeight: number;
    plugins?: PluginConfig;
    showConfidence: boolean;
    showIndex: boolean;
    showLabel: boolean;
    showTooltip: boolean;
    sidebarMode: "all" | "best" | "fast";
    timezone: string | null;
    theme: "browser" | "dark" | "light";
    useFrameNumber: boolean;
    mediaFields?: string[];
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
    gridMediaField?: string;
    modalMediaField?: string;
    mediaFields?: string[];
    plugins?: PluginConfig;
    sidebarGroups?: SidebarGroup[];
    sidebarMode?: "all" | "best" | "fast";
    colorScheme?: ColorScheme;
  }

  /**
   * The dataset object returned by the API.
   */
  export interface Dataset {
    stages?: Stage[];
    id: string;
    brainMethods: BrainRun[];
    createdAt: DateTime;
    defaultMaskTargets: Targets;
    evaluations: EvaluationRun[];
    savedViews: SavedView[];
    frameFields: StrictField[];
    lastLoadedAt: DateTime;
    maskTargets: {
      [key: string]: Targets;
    };
    groupSlice?: string;
    mediaType: MediaType;
    parentMediaType: MediaType;
    name: string;
    sampleFields: StrictField[];
    version: string;
    skeletons: StrictKeypointSkeleton[];
    defaultSkeleton?: KeypointSkeleton;
    groupMediaTypes?: {
      name: string;
      mediaType: MediaType;
    }[];
    defaultGroupSlice?: string;
    groupField: string;
    appConfig: DatasetAppConfig;
    info: { [key: string]: string };
    viewCls: null;
    viewFields: StrictField[]; // sample && frame fields in the current view
  }

  /**
   * @hidden
   */
  export interface CategoricalFilter<T> {
    values: T[];
    isMatching: boolean;
    exclude: boolean;
  }

  /**
   * @hidden
   */
  type Filter = CategoricalFilter<string>;

  export interface SortBySimilarityParameters {
    brainKey: string;
    distField?: string;
    k?: number;
    reverse?: boolean;
    query?: string | string[];
    queryIds?: string[];
  }

  export interface Filters {
    _label_tags?: CategoricalFilter<string>;
    [key: string]: Filter;
  }

  export interface Stage {
    _cls: string;
    kwargs: [string, any][];
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
    colorScheme?: ColorScheme;
  }
}

export interface CustomizeColor {
  path: string;
  fieldColor?: string;
  colorByAttribute?: string; // must be string field, int field, or boolean field
  valueColors?: {
    value: string;
    color: string;
  }[];
}

export interface ColorScheme {
  colorPool: string[];
  fields: CustomizeColor[];
}

export interface ColorSchemeSetting extends ColorScheme {
  saveToApp?: boolean;
}
