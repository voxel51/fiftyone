import { RGB } from "@fiftyone/looker/src/state";

export namespace State {
  export enum SPACE {
    FRAME,
    SAMPLE,
  }

  export interface Config {
    colorPool: string[];
    colorscale: string;
    gridZoom: string;
    loopVideos: string;
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

  export interface Dataset {
    annotationRuns: [];
    brainRuns: [];
    classes: {
      [key: string]: string;
    };
    createdAt: DateTime;
    defaultClasses: string[];
    defaultMaskTargets: Targets;
    evaluations: {
      [key: string]: Evaluation;
    };
    frameCollectionName: string;
    frameFields: Field[];
    info: object;
    lastLoadedAt: DateTime;
    maskTargets: {
      [key: string]: Targets;
    };
    mediaType: "image" | "video";
    name: string;
    sampleCollectionName: string;
    sampleFields: Field[];
    version: string;
    _id: ID;
  }

  export interface Field {
    ftype: string;
    dbField: string;
    name: string;
    embeddedDocType: string;
    subfield: string;
    fields: Schema;
  }

  export interface Schema {
    [key: string]: Field;
  }

  export interface Filter {}

  export interface Stage {}

  export interface Description {
    activeHandler: string | null;
    colorscale: RGB[];
    close: boolean;
    config: Config;
    connected: boolean;
    datasets: string[];
    dataset?: Dataset;
    filters: {
      [path: string]: Filter;
    };
    refresh: boolean;
    selected: string[];
    selectedLabels: string[];
    view: Stage[];
    viewCls: string | null;
  }
}
