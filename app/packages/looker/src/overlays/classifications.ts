/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { G } from "@svgdotjs/svg.js";

import { BaseState, Coordinates } from "../state";
import { CONTAINS, isShown, Overlay, RegularLabel } from "./base";

interface ClassificationLabel extends RegularLabel {}

export type ClassificationLabels = [string, ClassificationLabel[]][];

export default class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: ClassificationLabels;
  private readonly g: G;

  constructor(labels: ClassificationLabels) {
    this.labels = labels;
    this.g = new G();
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

  getSelectData(state, coordinates) {
    return { id: "s", field: "s" };
  }

  getMouseDistance(state, coordinates) {
    if (this.containsPoint(state, coordinates)) {
      return 0;
    }
    return Infinity;
  }

  containsPoint(state, [x, y]) {
    return CONTAINS.NONE;
  }

  getPointInfo(state, [x, y]) {
    return [{}];
  }

  draw(g, state) {
    g.add(this.g);
  }

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
