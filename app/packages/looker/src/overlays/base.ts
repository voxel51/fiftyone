/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getCls, sizeBytesEstimate } from "@fiftyone/utilities";
import { OverlayMask } from "../numpy";
import type { BaseState, Coordinates, NONFINITE } from "../state";
import { DenseLabelRenderStatus } from "../worker/shared";
import { getLabelColor, shouldShowLabelTag } from "./util";

// in numerical order (CONTAINS_BORDER takes precedence over CONTAINS_CONTENT)
export enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}

export interface BaseLabel {
  id: string;
  frame_number?: number;
  tags: string[];
  index?: number;
  renderStatus?: DenseLabelRenderStatus;
}

export interface PointInfo<Label extends BaseLabel = BaseLabel> {
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

export type LabelMask = {
  bitmap?: ImageBitmap;
  data?: OverlayMask;
};

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

export interface Overlay<State extends Partial<BaseState>> {
  draw(ctx: CanvasRenderingContext2D, state: State): void;
  isShown(state: Readonly<State>): boolean;
  field?: string;
  label?: BaseLabel;
  containsPoint(state: Readonly<State>): CONTAINS;
  getMouseDistance(state: Readonly<State>): number;
  getPointInfo(state: Readonly<State>): any;
  getPoints(state: Readonly<State>): Coordinates[];
  getSelectData(state: Readonly<State>): SelectData;
  getSizeBytes(): number;
  cleanup?(setTargetsToNull: boolean): void;
}

export abstract class CoordinateOverlay<
  State extends BaseState,
  Label extends RegularLabel
> implements Overlay<State>
{
  readonly field: string;
  readonly label: Label;

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

  isTagFiltered(state: Readonly<State>): boolean {
    return state.options.selectedLabelTags?.some((tag) =>
      this.label.tags.includes(tag)
    );
  }

  getColor({
    config,
    options: {
      coloring,
      customizeColorSetting,
      selectedLabelTags,
      labelTagColors,
    },
  }: Readonly<State>): string {
    return getLabelColor({
      coloring,
      path: this.field,
      label: this.label,
      isTagged: shouldShowLabelTag(selectedLabelTags, this.label.tags),
      labelTagColors,
      customizeColorSetting,
      embeddedDocType: getCls(this.field, config.fieldSchema),
    });
  }

  abstract containsPoint(state: Readonly<State>): CONTAINS;

  abstract getMouseDistance(state: Readonly<State>): number;

  abstract getPointInfo(state: Readonly<State>): PointInfo<Label>;

  abstract getPoints(state: Readonly<State>): Coordinates[];

  getSelectData(state: Readonly<State>): SelectData {
    return {
      id: this.label.id,
      field: this.field,
      // @ts-ignore
      frameNumber: state.frameNumber,
    };
  }

  getSizeBytes(): number {
    return sizeBytesEstimate(this.label);
  }
}
