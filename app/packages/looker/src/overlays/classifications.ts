/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { TEXT_COLOR } from "../constants";
import { BaseState, BoundingBox, Coordinates } from "../state";
import { CONTAINS, isShown, Overlay, PointInfo, RegularLabel } from "./base";

interface ClassificationLabel extends RegularLabel {}

export type ClassificationLabels = [string, ClassificationLabel[]][];

export default class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: ClassificationLabels;
  private labelBoundingBoxes: { [key: string]: BoundingBox };

  constructor(labels: ClassificationLabels) {
    this.labels = labels;
    this.labelBoundingBoxes = {};
  }

  getColor(
    state: Readonly<State>,
    field: string,
    label: ClassificationLabel
  ): string {
    const key = state.options.colorByLabel ? label.label : field;
    return state.options.colorMap(key);
  }

  isShown(state: Readonly<State>): boolean {
    return this.getFiltered(state).length > 0;
  }

  getSelectData(state: Readonly<State>) {
    const { id, field, frameNumber } = this.getPointInfo(state);
    return { id, field, frameNumber };
  }

  getMouseDistance(state: Readonly<State>) {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state: Readonly<State>): PointInfo {
    return {};
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    const labels = this.getFilteredAndFlat(state);
    const width = Math.max(
      ...labels.map(
        ([_, label]) => ctx.measureText(this.getLabelText(state, label)).width
      )
    );
    const newBoxes = {};
    let top = state.textPad;

    labels.forEach(([field, label]) => {
      const result = this.strokeClassification(
        ctx,
        state,
        top,
        width,
        field,
        label
      );
      top = result.top;
      if (result.box) {
        newBoxes[label._id] = result.box;
      }
    });

    this.labelBoundingBoxes = newBoxes;
  }

  getPoints() {
    return getClassificationPoints([]);
  }

  private getFiltered(state: Readonly<State>): ClassificationLabels {
    return this.labels.map(([field, labels]) => [
      field,
      labels.filter((label) => isShown(state, field, label)),
    ]);
  }

  private getFilteredAndFlat(
    state: Readonly<State>
  ): [string, ClassificationLabel][] {
    let result: [string, ClassificationLabel][] = [];
    this.getFiltered(state).forEach(([field, labels]) => {
      result = [
        ...result,
        ...labels.map<[string, ClassificationLabel]>((label) => [field, label]),
      ];
    });
    return result;
  }

  isSelected(state: Readonly<State>, label: ClassificationLabel): boolean {
    return state.options.selectedLabels.includes(label._id);
  }

  private strokeClassification(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    top: number,
    width: number,
    field: string,
    label: ClassificationLabel
  ): { top: number; box?: BoundingBox } {
    const text = this.getLabelText(state, label);
    if (text.length === 0) {
      return { top };
    }
    const color = this.getColor(state, field, label);
    const selected = this.isSelected(state, label);

    const [tlx, tly, brx, bry] = [
      state.textPad,
      top,
      state.textPad * 3 + width,
      state.fontSize + top + state.textPad * 3,
    ];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(tlx, tly);
    ctx.lineTo(brx, tly);
    ctx.lineTo(brx, bry);
    ctx.lineTo(tlx, bry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(text, tlx + state.textPad, bry - state.textPad);

    return {
      top: bry + state.textPad,
      box: [tlx, tly, brx, bry],
    };
  }

  private getLabelText(
    state: Readonly<State>,
    label: ClassificationLabel
  ): string {
    let text = label.label && state.options.showLabel ? `${label.label}` : "";

    if (state.options.showConfidence && !isNaN(label.confidence)) {
      text.length && (text += " ");
      text += `(${Number(label.confidence).toFixed(2)})`;
    }

    return text;
  }
}

export const getClassificationPoints = (
  labels: ClassificationLabel[]
): Coordinates[] => {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
};
