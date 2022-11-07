import { StrictField } from "@fiftyone/utilities";

export namespace State {
  export type MediaType = "image" | "group" | "point_cloud" | "video";

  export enum SPACE {
    FRAME = "FRAME",
    SAMPLE = "SAMPLE",
  }

  export type SidebarGroups = [string, string[]][];

  export type PluginConfig = { [pluginName: string]: object };
  export interface Config {
    colorPool: string[];
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
    useFrameNumber: boolean;
    mediaFields: string[];
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

  export interface DatasetAppConfig {
    gridMediaField?: string;
    modalMediaField?: string;
    mediaFields?: string[];
    plugins?: PluginConfig;
    sidebarGroups?: { name: string; paths: string[] }[];
  }
  export interface Dataset {
    id: string;
    brainMethods: BrainRun[];
    createdAt: DateTime;
    defaultMaskTargets: Targets;
    evaluations: EvaluationRun[];
    frameFields: StrictField[];
    lastLoadedAt: DateTime;
    maskTargets: {
      [key: string]: Targets;
    };
    groupSlice?: string;
    mediaType: MediaType;
    name: string;
    sampleFields: StrictField[];
    version: string;
    skeletons: StrictKeypointSkeleton[];
    defaultSkeleton: KeypointSkeleton;
    groupMediaTypes?: {
      name: string;
      mediaType: MediaType;
    }[];
    defaultGroupSlice: string;
    groupField: string;
    appConfig: DatasetAppConfig;
    info: { [key: string]: string };
  }

  export interface Filter {}

  export enum TagKey {
    SAMPLE = "sample",
    LABEL = "label",
  }

  export interface SortBySimilarityParameters {
    brainKey: string;
    distField?: string;
    k?: number;
    reverse?: boolean;
  }

  export interface Filters {
    tags?: {
      [key in TagKey]?: string[];
    };
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
  }
}
