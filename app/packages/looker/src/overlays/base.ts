/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { G } from "@svgdotjs/svg.js";
import { BaseState, Coordinates } from "../state";

// in numerical order (CONTAINS_BORDER takes precedence over CONTAINS_CONTENT)
export enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}

export interface BaseLabel {
  _id: string;
  frame_number?: number;
  tags: string[];
  index?: number;
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
  if (
    state.options.activeLabels &&
    !state.options.activeLabels.includes(field)
  ) {
    return false;
  }

  if (
    state.options.filter &&
    state.options.filter[field] &&
    state.options.filter[field].call
  ) {
    return state.options.filter[field](label);
  }

  return true;
};

export interface Overlay<State extends BaseState> {
  draw(g: G, state: State): void;
  isShown(state: Readonly<State>): boolean;
  field?: string;
  containsPoint(state: Readonly<State>, coordinates: Coordinates): CONTAINS;
  getMouseDistance(state: Readonly<State>, coordinates: Coordinates): number;
  getPointInfo(state: Readonly<State>, coordinates: Coordinates): any;
  getSelectData(state: Readonly<State>, coordinates: Coordinates): SelectData;
  getPoints(): Coordinates[];
}

export abstract class CoordinateOverlay<
  State extends BaseState,
  Label extends RegularLabel
> implements Overlay<State> {
  readonly field: string;
  protected readonly label: Label;

  constructor(field: string, label: Label) {
    this.field = field;
    this.label = label;
  }

  abstract draw(g: G, state: Readonly<State>): void;

  isShown(state: Readonly<State>): boolean {
    return isShown<State, Label>(state, this.field, this.label);
  }

  isSelected(state: Readonly<State>) {
    return state.options.selectedLabels.includes(this.label._id);
  }

  getColor({ options }: Readonly<State>): string {
    const key = options.colorByLabel ? this.label.label : this.field;
    return options.colorMap(key);
  }

  abstract containsPoint(state: Readonly<State>, [x, y]: Coordinates);

  abstract getMouseDistance(state: Readonly<State>, [x, y]: Coordinates);

  abstract getPointInfo(state: Readonly<State>, [x, y]: Coordinates);

  abstract getPoints(): Coordinates[];

  getSelectData(state: Readonly<State>, [x, y]: Coordinates) {
    return {
      id: this.label._id,
      field: this.field,
    };
  }
}
