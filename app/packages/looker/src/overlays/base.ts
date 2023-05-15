/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getColor } from "@fiftyone/utilities";
import { BaseState, Coordinates, NONFINITE } from "../state";
import { isValidColor, sizeBytes } from "./util";

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
  point?: {
    index: number;
    attributes: [string, unknown][];
    coordinates: Coordinates;
  };
  target?: number;
  type: string;
}

export interface SelectData {
  field: string;
  id: string;
  frameNumber?: number;
}

export interface RegularLabel extends BaseLabel {
  _id?: string;
  label?: string;
  confidence?: number | NONFINITE;
}

export const isShown = <State extends BaseState, Label extends RegularLabel>(
  state: Readonly<State>,
  field: string,
  label: Label
) => {
  if (state.options.filter) {
    return state.options.filter(field, label);
  }

  return true;
};

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
}

export abstract class CoordinateOverlay<
  State extends BaseState,
  Label extends RegularLabel
> implements Overlay<State>
{
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

  getColor({
    options: { coloring, customizeColorSetting },
  }: Readonly<State>): string {
    let key;
    // video fields path needs to be converted
    const path = this.field.startsWith("frames.")
      ? this.field.slice("frames.".length)
      : this.field;
    const field = customizeColorSetting.find((s) => s.field === path);
    if (coloring.by === "field") {
      if (
        field?.useFieldColor &&
        field?.fieldColor &&
        isValidColor(field.fieldColor)
      ) {
        return field.fieldColor;
      }
      return getColor(coloring.pool, coloring.seed, this.field);
    }
    if (coloring.by === "value") {
      if (field) {
        key = field.attributeForColor
          ? field.attributeForColor === "index"
            ? "id"
            : field.attributeForColor
          : "label";
        // check if this label has a assigned color, use it if it is a valid color
        const labelColor = field.labelColors?.find(
          (l) => l.name == this.label[key]?.toString()
        )?.color;

        return isValidColor(labelColor)
          ? labelColor
          : getColor(coloring.pool, coloring.seed, this.label[key]);
      } else {
        return getColor(coloring.pool, coloring.seed, this.label["label"]);
      }
    }
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
}
