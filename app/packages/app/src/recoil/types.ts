import { RGB } from "@fiftyone/looker/src/state";
import { StrictField } from "@fiftyone/utilities";

export namespace State {
  export enum SPACE {
    FRAME = "FRAME",
    SAMPLE = "SAMPLE",
  }

  export type SidebarGroups = [string, string[]][];

  export interface Config {
    colorPool: string[];
    colorscale: string;
    gridZoom: number;
    loopVideos: boolean;
    notebookHeight: number;
    showConfidence: boolean;
    showIndex: boolean;
    showLabel: boolean;
    showTooltip: boolean;
    timezone: string | null;
    useFrameNumber: boolean;
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
    timestamp: { date: number };
    config: {};
    viewStages: string[];
    result: ID;
  }

  export interface BrainRun extends Run {
    config: {
      cls: "fiftyone.brain.similarity.SimilarityConfig";
      embeddingsField?: string;
      method: string;
      patchesField?: string;
    };
  }

  export interface EvaluationRun extends Run {
    config: {
      classwise: boolean;
      cls: "fiftyone.utils.eval.coco.COCOEvaluationConfig";
      computeMAp: boolean;
      errorLevel: 0 | 1 | 2 | 3;
      gtField: string;
      iou: number;
      iouThreshs?: number;
      iscrowd: string;
      maxPreds?: number;
      method: string;
      predField: string;
      tolerance?: number;
      useBoxes: boolean;
      useMasks: boolean;
    };
  }

  export interface AnnotationRun extends Run {
    config: {};
  }

  export interface Dataset {
    annotationRuns: AnnotationRun[];
    brainMethods: BrainRun[];
    classes: {
      [key: string]: string;
    };
    createdAt: DateTime;
    defaultClasses: string[];
    defaultMaskTargets: Targets;
    evaluations: EvaluationRun[];
    frameCollectionName: string;
    frameFields: StrictField[];
    info: object;
    lastLoadedAt: DateTime;
    maskTargets: {
      [key: string]: Targets;
    };
    mediaType: "image" | "video";
    name: string;
    sampleCollectionName: string;
    sampleFields: StrictField[];
    version: string;
    appSidebarGroups?: { name: string; paths: string[] }[];
    _id: ID;
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
    kwargs: [string, object][];
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
    activeHandle: string | null;
    colorscale: RGB[];
    close: boolean;
    config: Config;
    connected: boolean;
    datasets: string[];
    dataset?: Dataset;
    filters: Filters;
    refresh: boolean;
    selected: string[];
    selectedLabels: SelectedLabel[];
    view: Stage[];
    viewCls: string | null;
  }
}
