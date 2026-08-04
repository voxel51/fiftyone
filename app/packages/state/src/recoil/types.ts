import type { CustomizeColorInput } from "@fiftyone/relay";
import type { SpaceNodeJSON } from "@fiftyone/spaces";
import type { RecognizedMediaType } from "@fiftyone/utilities";

export type SelectionType = "default" | "alt";
export type SelectionIconStyle =
  | "checkmark"
  | "green-checkmark"
  | "red-checkmark"
  | "thumbsup"
  | "thumbsdown"
  | "pin"
  | "star"
  | "x"
  | "bookmark";
export type SelectionStyle = {
  default: SelectionIconStyle;
  alt: SelectionIconStyle;
};

export const DEFAULT_SELECTION_STYLE: SelectionStyle = {
  default: "checkmark",
  alt: "checkmark",
};

export type LabelSelectionStyleName = "dashed" | "dashed-green" | "dashed-red";
export type LabelSelectionStyle = {
  default: LabelSelectionStyleName;
  alt: LabelSelectionStyleName;
};

export const DEFAULT_LABEL_SELECTION_STYLE: LabelSelectionStyle = {
  default: "dashed",
  alt: "dashed",
};

export namespace State {
  export type MediaType =
    | RecognizedMediaType
    | "point_cloud"
    | "three_d"
    | "unknown";

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

  export type ActiveFields = {
    exclude?: boolean | null;
    paths: string[];
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
    viewStages?: readonly string[];
  }

  export interface BrainRun extends Run {
    /** Whether the run's results have been saved. A run still computing (or
     * whose computation died) is not ready. */
    ready: boolean | null;
    /** Why the run cannot be used, when knowable from the run doc alone
     * (e.g. its config class no longer imports); null when usable. */
    error: string | null;
    config: {
      embeddingsField: string | null;
      method: string;
      patchesField: string | null;
      cls: string;
      supportsPrompts: boolean | null;
      type: string | null;
      maxK: number | null;
      supportsLeastSimilarity: boolean | null;
      /** Visualization runs */
      numDims: number | null;
      pointsField: string | null;
      model: string | null;
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
    groupBy: object | string[];
    orderBy?: string;
    orderByKey?: unknown;
  }

  export interface DatasetAppConfig {
    activeFields?: ActiveFields;
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
    instanceId?: string;
    type?: SelectionType;
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
