/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  DASH_COLOR,
  MOMENT_CLASSIFICATIONS,
  TEXT_COLOR,
  VIDEO_CLASSIFICATION,
} from "../constants";
import { BaseState, BoundingBox, Coordinates, VideoState } from "../state";
import {
  CONTAINS,
  isShown,
  Overlay,
  PointInfo,
  RegularLabel,
  SelectData,
} from "./base";
import { sizeBytes } from "./util";

export interface Classification extends RegularLabel {}

interface ClassificationLabel extends Classification {
  _cls: "Classification";
}

export type Labels<T> = [string, T[]][];

export class ClassificationsOverlay<
  State extends BaseState,
  Label extends Classification = ClassificationLabel
> implements Overlay<State> {
  private labelBoundingBoxes: { [key: string]: BoundingBox };

  protected readonly labels: Labels<Label>;

  constructor(labels: Labels<Label>) {
    this.labels = labels;
    this.labelBoundingBoxes = {};
  }

  getColor(state: Readonly<State>, field: string, label: Label): string {
    const key = state.options.colorByLabel ? label.label : field;
    return state.options.colorMap(key);
  }

  isShown(state: Readonly<State>): boolean {
    return this.getFiltered(state).length > 0;
  }

  getSelectData(state: Readonly<State>): SelectData {
    const {
      label: { id },
      field,
    } = this.getPointInfo(state);
    return { id, field };
  }

  getMouseDistance(state: Readonly<State>): number {
    if (this.getPointInfo(state)) {
      return 0;
    }
    return Infinity;
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (this.getPointInfo(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  getPointInfo(state: Readonly<State>): PointInfo {
    const filtered = this.getFilteredAndFlat(state);
    const [w, h] = state.config.dimensions;

    for (const [field, label] of filtered) {
      const box = this.labelBoundingBoxes[label.id];

      if (box) {
        let [bx, by, bw, bh] = box;
        [bx, by, bw, bh] = [bx * w, by * h, bw * w, bh * h];

        const [px, py] = state.pixelCoordinates;

        if (px >= bx && py >= by && px <= bx + bw && py <= by + bh) {
          return {
            field: field,
            label,
            type: "Classification",
            color: this.getColor(state, field, label),
          };
        }
      }
    }
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
        newBoxes[label.id] = result.box;
      }
    });

    this.labelBoundingBoxes = newBoxes;
  }

  getPoints(state: Readonly<State>) {
    if (this.getFilteredAndFlat(state).length) {
      return getClassificationPoints([]);
    }
    return [];
  }

  getSizeBytes() {
    let bytes = 100;
    this.labels.forEach(([_, labels]) => {
      labels.forEach((label) => {
        bytes += sizeBytes(label);
      });
    });
    return bytes;
  }

  protected getFiltered(state: Readonly<State>): Labels<Label> {
    return this.labels.map(([field, labels]) => [
      field,
      labels.filter(
        (label) =>
          MOMENT_CLASSIFICATIONS.includes(label._cls) &&
          isShown(state, field, label) &&
          label.label
      ),
    ]);
  }

  getFilteredAndFlat(
    state: Readonly<State>,
    sort: boolean = true
  ): [string, Label][] {
    let result: [string, Label][] = [];
    this.getFiltered(state).forEach(([field, labels]) => {
      result = [
        ...result,
        ...labels.map<[string, Label]>((label) => [field, label]),
      ];
    });

    if (sort) {
      const store = Object.fromEntries(
        state.options.activePaths.map<[string, Label[]]>((a) => [a, []])
      );
      result.forEach(([field, label]) => {
        store[field].push(label);
      });
      result = state.options.activePaths.reduce<[string, Label][]>(
        (acc, field) => {
          return [
            ...acc,
            ...store[field].map<[string, Label]>((label) => [field, label]),
          ];
        },
        []
      );
      result.sort((a, b) => {
        if (a[0] === b[0]) {
          if (a[1].label && b[1].label && a[1].label < b[1].label) {
            return -1;
          } else if (a[1].label > b[1].label) {
            return 1;
          }
          return 0;
        }
        return -1;
      });
    }
    return result;
  }

  isSelected(state: Readonly<State>, label: Label): boolean {
    return state.options.selectedLabels.includes(label.id);
  }

  private strokeClassification(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    top: number,
    width: number,
    field: string,
    label: Label
  ): { top: number; box?: BoundingBox } {
    const text = this.getLabelText(state, label);
    if (text.length === 0) {
      return { top };
    }
    const color = this.getColor(state, field, label);
    const [cx, cy] = state.canvasBBox;

    let [tlx, tly, w, h] = [
      state.textPad + cx,
      top + cy,
      state.textPad * 3 + width,
      state.fontSize + state.textPad * 3,
    ];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(tlx, tly);
    ctx.lineTo(tlx + w, tly);
    ctx.lineTo(tlx + w, tly + h);
    ctx.lineTo(tlx, tly + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(text, tlx + state.textPad, tly + h - state.textPad);

    this.strokeBorder(ctx, state, [tlx, tly, w, h], color);

    if (this.isSelected(state, label)) {
      this.strokeBorder(
        ctx,
        state,
        [tlx, tly, w, h],
        DASH_COLOR,
        state.dashLength
      );
    }

    tlx -= cx;
    tly -= cy;

    return {
      top: tly + h + state.textPad * 2,
      box: [
        (tlx - state.textPad / 2) / state.canvasBBox[2],
        tly / state.canvasBBox[3],
        (w + state.textPad / 2) / state.canvasBBox[2],
        (h + state.textPad) / state.canvasBBox[3],
      ],
    };
  }

  private getLabelText(state: Readonly<State>, label: Label): string {
    let text = label.label && state.options.showLabel ? `${label.label}` : "";

    if (state.options.showConfidence && !isNaN(label.confidence as number)) {
      text.length && (text += " ");
      text += `(${Number(label.confidence).toFixed(2)})`;
    }

    return text;
  }

  private strokeBorder(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    [tlx, tly, w, h]: BoundingBox,
    color: string,
    dash?: number
  ) {
    ctx.beginPath();
    ctx.lineWidth = state.strokeWidth;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash ? [dash] : []);
    ctx.moveTo(tlx, tly);
    ctx.lineTo(tlx + w, tly);
    ctx.lineTo(tlx + w, tly + h);
    ctx.lineTo(tlx, tly + h);
    ctx.closePath();
    ctx.stroke();
  }
}

export interface VideoClassificationLabel extends Classification {
  support: [number, number];
  _cls: "VideoClassification";
}

export class VideoClassificationsOverlay extends ClassificationsOverlay<
  VideoState,
  VideoClassificationLabel | ClassificationLabel
> {
  getFiltered(state: Readonly<VideoState>) {
    return this.labels.map<
      [string, (VideoClassificationLabel | ClassificationLabel)[]]
    >(([field, labels]) => [
      field,
      labels.filter((label) => {
        const shown = isShown(state, field, label) && label.label;
        if (label._cls === VIDEO_CLASSIFICATION) {
          return (
            shown &&
            label.support[0] <= state.frameNumber &&
            label.support[1] >= state.frameNumber
          );
        }

        return shown;
      }),
    ]);
  }
}

export const getClassificationPoints = (
  labels: ClassificationLabel[]
): Coordinates[] => {
  return [];
};
