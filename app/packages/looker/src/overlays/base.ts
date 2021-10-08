/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { getColor } from "../color";
import { BaseState, Coordinates } from "../state";
import { sizeBytes } from "./util";

// in numerical order (CONTAINS_BORDER takes precedence over CONTAINS_CONTENT)
export enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}

export interface BaseLabel {
  id: string;
  _cls: string;
  frame_number?: number;
  tags: string[];
  index?: number;
}

export interface PointInfo<Label extends BaseLabel> {
  color: string;
  field: string;
  label: Label;
  point?: Coordinates;
  target?: number;
  type: string;
}

export interface SelectData {
  field: string;
  id: string;
  frameNumber?: number;
}

export interface RegularLabel extends BaseLabel {
  label?: string;
  confidence?: number;
}

export interface SelectData {
  id: string;
  field: string;
}

export const isShown = <State extends BaseState, Label extends RegularLabel>(
  state: Readonly<State>,
  field: string,
  label: Label
) => {
  if (state.options.activePaths && !state.options.activePaths.includes(field)) {
    return false;
  }

  if (state.options.filter && state.options.filter[field]) {
    return state.options.filter[field](label);
  }

  return true;
};

export interface LabelUpdate<Label extends BaseLabel> {
  buffers: ArrayBuffer[];
  label: Label;
  field: string;
}

export interface Overlay<State extends BaseState> {
  draw(ctx: CanvasRenderingContext2D, state: State): void;
  isShown(state: Readonly<State>): boolean;
  field?: string;
  containsPoint(state: Readonly<State>): CONTAINS;
  getMouseDistance(state: Readonly<State>): number;
  getPointInfo(state: Readonly<State>): any;
  getSelectData(state: Readonly<State>): SelectData;
  getPoints(state: Readonly<State>): Coordinates[];
  getSizeBytes(): number;
  needsLabelUpdate(state: Readonly<State>): boolean;
  getLabelData(
    state: Readonly<State>,
    messageUUID: string
  ): LabelUpdate<BaseLabel>[];
  updateLabelData(labels: LabelUpdate<BaseLabel>[], messageUUID: string);
}

export abstract class CoordinateOverlay<
  State extends BaseState,
  Label extends RegularLabel
> implements Overlay<State> {
  readonly field: string;
  protected label: Label;

  constructor(field: string, label: Label) {
    this.field = field;
    this.label = label;
  }

  abstract draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void;

  isShown(state: Readonly<State>): boolean {
    return isShown<State, Label>(state, this.field, this.label);
  }

  isSelected(state: Readonly<State>): boolean {
    return state.options.selectedLabels.includes(this.label.id);
  }

  getColor({ options }: Readonly<State>): string {
    const key = options.coloring.byLabel ? this.label.label : this.field;
    return getColor(options.coloring.pool, options.coloring.seed, key);
  }

  abstract containsPoint(state: Readonly<State>): CONTAINS;

  abstract getMouseDistance(state: Readonly<State>): number;

  abstract getPointInfo(state: Readonly<State>): PointInfo<Label>;

  abstract getPoints(state: Readonly<State>): Coordinates[];

  getSizeBytes(): number {
    return sizeBytes(this.label);
  }

  getSelectData(state: Readonly<State>): SelectData {
    return {
      id: this.label.id,
      field: this.field,
      // @ts-ignore
      frameNumber: state.frameNumber,
    };
  }

  needsLabelUpdate(state: Readonly<State>): boolean {
    return false;
  }

  getLabelData(
    state: Readonly<State>,
    messageUUID: string
  ): LabelUpdate<BaseLabel>[] {
    return [];
  }

  updateLabelData(labels: LabelUpdate<Label>[], messageUUID: string): void {}
}
