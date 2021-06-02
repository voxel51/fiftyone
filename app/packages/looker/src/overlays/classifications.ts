/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ColorGenerator } from "../color";
import { DASH_COLOR, DASH_LENGTH } from "../constants";
import { BaseState, Coordinates } from "../state";
import { computeBBoxForTextOverlay } from "../util";
import { CONTAINS, isShown, Overlay, RegularLabel } from "./base";

interface ClassificationLabel extends RegularLabel {}

export type ClassificationLabels = [string, ClassificationLabel[]][];

const PADDING = 8;
const OVERLAY_BG_COLOR = "hsla(210, 20%, 10%, 0.8)";

export default class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: ClassificationLabels;
  private readonly font: string;
  private lines: string[] = [];
  private width: number;
  private lineHeight: number;

  constructor(labels: ClassificationLabels) {
    this.labels = labels;
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

  private updateLines(state: Readonly<State>) {
    this.lines = [];
    const strLimit = 24;
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

  draw(context, state) {
    this.updateLines(state);
    if (!this.lines.length) {
      return;
    }
    const fontHeight = Math.min(20, 0.09 * context.canvas.height);
    context.font = this.font;

    let y = PADDING;
    const bboxes = this.lines.map((label) =>
      computeBBoxForTextOverlay(context, [label], fontHeight, PADDING)
    );
    this.lineHeight = bboxes[0].height;
    this.width = Math.max(...bboxes.map((b) => b.width));

    const labels = this.getFilteredAndFlat(state);

    for (let l = 0; l < this.lines.length; l++) {
      context.fillStyle = OVERLAY_BG_COLOR;
      context.fillRect(PADDING, y, this.width, this.lineHeight);

      // Rendering y is at the baseline of the text
      context.fillStyle = ColorGenerator.white;
      context.fillText(this.lines[l], PADDING * 2, y + fontHeight + PADDING);
      const [field, label] = labels[l];
      if (state.options.selectedLabels.includes(label._id)) {
        context.lineWidth = PADDING / 2;
        context.strokeRect(PADDING, y, this.width, this.lineHeight);
        context.strokeStyle = this.getColor(state, field, label);
        context.strokeRect(PADDING, y, this.width, this.lineHeight);
        context.strokeStyle = DASH_COLOR;
        context.setLineDash([DASH_LENGTH]);
        context.strokeRect(PADDING, y, this.width, this.lineHeight);
        context.setLineDash([]);
      }
      y += PADDING + this.lineHeight;
    }
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
