/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { CONTAINS, isShown, Overlay, RegularLabel } from "./base";

interface ClassificationLabel extends RegularLabel {}

export type ClassificationLabels = [string, ClassificationLabel[]][];

export default class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: ClassificationLabels;

  constructor(labels: ClassificationLabels) {
    this.labels = labels;
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

  private getFiltered(state: Readonly<State>): ClassificationLabels {
    return this.labels.map(([field, labels]) => [
      field,
      labels.filter((label) => isShown(state, field, label)),
    ]);
  }

  getSelectData(state: Readonly<State>) {
    return { id: "s", field: "s" };
  }

  getMouseDistance(state: Readonly<State>) {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  containsPoint(state) {
    return CONTAINS.NONE;
  }

  getPointInfo(state: Readonly<State>) {
    return {};
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {}

  getPoints() {
    return getClassificationPoints([]);
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
