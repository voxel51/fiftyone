/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { G } from "@svgdotjs/svg.js";

import { BaseState, Coordinates } from "../state";
import { CONTAINS, isShown, Overlay, RegularLabel } from "./base";

interface ClassificationLabel extends RegularLabel {}

export type ClassificationLabels = [string, ClassificationLabel[]][];

const PADDING = 4;

export default class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: ClassificationLabels;
  private readonly g: G;
  private lines: { [id: string]: G };

  constructor(labels: ClassificationLabels) {
    this.labels = labels;
    this.g = new G();
  }

  private getColor(
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

  private getFilteredAndFlat(
    state: Readonly<State>
  ): [string, ClassificationLabel][] {
    return this.getFiltered(state)
      .map<[string, ClassificationLabel][]>(([field, labels]) =>
        labels.map((label) => [field, label])
      )
      .flat();
  }

  private getLines(state: Readonly<State>) {
    this.lines = [];
    const strLimit = 48;
    this.getFiltered(state).forEach(([field, labels]) => {
      const name =
        field.length > strLimit ? field.slice(0, strLimit) + "..." : field;

      this.lines = [
        ...this.lines,
        ...labels[field].map(([_, { confidence, label }]) => {
          label =
            typeof label === "string" && label.length > strLimit
              ? label.slice(0, strLimit) + "..."
              : label;

          let s = `${name}: ${label}`;
          if (state.options.showConfidence && !isNaN(confidence)) {
            s += ` (${Number(confidence).toFixed(2)})`;
          }

          return s;
        }),
      ];
    });
  }

  getSelectData(state, coordinates) {
    const {
      label: { _id: id },
      field,
    } = this.getPointInfo(state, coordinates)[0];
    return { id, field };
  }

  getMouseDistance(state, coordinates) {
    if (this.containsPoint(state, coordinates)) {
      return 0;
    }
    return Infinity;
  }

  containsPoint(state, [x, y]) {
    const xAxis = x > PADDING && x < this.width + PADDING;
    return xAxis &&
      this.getYIntervals(state).some(
        ({ y: top, height }) => y > top && y < top + height
      )
      ? CONTAINS.CONTENT
      : CONTAINS.NONE;
  }

  getPointInfo(state, [x, y]) {
    const yIntervals = this.getYIntervals(state);
    const [field, label] = this.getFilteredAndFlat(state).filter((_, i) => {
      const { y: top, height } = yIntervals[i];
      return y > top && y < top + height;
    })[0];

    return [
      {
        color: this.getColor(state, field, label),
        field,
        label,
        type: "Classification",
      },
    ];
  }

  private getYIntervals(state: Readonly<State>) {
    return this.getFilteredAndFlat(state).map((_, i) => ({
      y: PADDING + i * (this.lineHeight + PADDING),
      height: this.lineHeight,
    }));
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
