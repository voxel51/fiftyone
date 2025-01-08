/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  REGRESSION,
  TEMPORAL_DETECTION,
  TEMPORAL_DETECTIONS,
  getCls,
  sizeBytesEstimate,
} from "@fiftyone/utilities";

import { INFO_COLOR, MOMENT_CLASSIFICATIONS } from "../constants";
import {
  BaseState,
  BoundingBox,
  Coordinates,
  NONFINITE,
  VideoState,
} from "../state";
import {
  CONTAINS,
  Overlay,
  PointInfo,
  RegularLabel,
  SelectData,
  isShown,
} from "./base";
import { getLabelColor } from "./util";

export type Classification = RegularLabel;

export interface Regression {
  confidence?: number | NONFINITE;
  value?: number | NONFINITE;
}

export type ClassificationLabel = Classification & Regression;

export type Labels<T> = [string, T[]][];

const TEMPORAL_LABELS = new Set([TEMPORAL_DETECTION, TEMPORAL_DETECTIONS]);

export class ClassificationsOverlay<
  State extends BaseState,
  Label extends Classification = ClassificationLabel
> implements Overlay<State>
{
  private labelBoundingBoxes: { [key: string]: BoundingBox };

  protected readonly labels: Labels<Label>;

  constructor(labels: Labels<Label>) {
    this.labels = labels;
    this.labelBoundingBoxes = {};
  }

  getColor(state: Readonly<State>, field: string, label: Label): string {
    const { coloring, customizeColorSetting, labelTagColors } = state.options;
    const isTagged =
      (state.options.selectedLabelTags?.length == 0 && label.tags.length > 0) ||
      state.options.selectedLabelTags?.some((tag) => label.tags.includes(tag));

    return getLabelColor({
      coloring: coloring,
      path: field,
      label,
      isTagged,
      labelTagColors,
      customizeColorSetting,
      embeddedDocType: getCls(field, state.config.fieldSchema),
    });
  }

  isShown(state: Readonly<State>): boolean {
    return this.getFiltered(state).length > 0;
  }

  getSelectData(state: Readonly<State>): SelectData {
    const {
      label: { id },
      field,
    } = this.getPointInfo(state);
    return { id: id, field };
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

  getPointInfo(state: Readonly<State>): PointInfo<Label> {
    const filtered = this.getFilteredAndFlat(state);
    const [w, h] = state.dimensions;

    let result: PointInfo<Label>;

    for (const [field, label] of filtered) {
      const box = this.labelBoundingBoxes[label.id];

      if (box) {
        let [bx, by, bw, bh] = box;
        [bx, by, bw, bh] = [bx * w, by * h, bw * w, bh * h];

        const [px, py] = state.pixelCoordinates;

        if (px >= bx && py >= by && px <= bx + bw && py <= by + bh) {
          result = {
            field: field,
            label,
            type: this.getCls(field, state),
            color: this.getColor(state, field, label),
          };
        }
      }
    }

    return result;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    const labels = this.getFilteredAndFlat(state);
    const width = Math.max(
      ...labels.map(
        ([field, label]) =>
          ctx.measureText(this.getLabelText(field, state, label)).width
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

  protected getFiltered(state: Readonly<State>): Labels<Label> {
    return this.labels.map(([field, labels]) => {
      return [
        field,
        Array.isArray(labels)
          ? labels.filter(
              (label) =>
                MOMENT_CLASSIFICATIONS.includes(this.getCls(field, state)) &&
                isShown(state, field, label)
            )
          : [],
      ];
    });
  }

  getFilteredAndFlat(state: Readonly<State>, sort = true): [string, Label][] {
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
    const text = this.getLabelText(field, state, label);
    if (text.length === 0) {
      return { top };
    }
    const color = this.getColor(state, field, label);
    const [cx, cy] = state.canvasBBox;

    const tmp = ctx.globalAlpha;
    ctx.globalAlpha = state.options.alpha;

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
    ctx.globalAlpha = tmp;

    ctx.fillStyle = INFO_COLOR;
    ctx.fillText(text, tlx + state.textPad, tly + h - state.textPad);

    this.strokeBorder(ctx, state, [tlx, tly, w, h], color);

    if (this.isSelected(state, label)) {
      this.strokeBorder(
        ctx,
        state,
        [tlx, tly, w, h],
        INFO_COLOR,
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

  private getLabelText(
    field: string,
    state: Readonly<State>,
    label: Label
  ): string {
    let text = state.options.showLabel
      ? `${getText(this.getCls(field, state), label)}`
      : "";

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

  needsLabelUpdate() {
    return false;
  }
  getLabelData() {
    return [];
  }
  updateLabelData() {}

  getCls(field: string, state: Readonly<State>) {
    return getCls(field, state.config.fieldSchema);
  }

  getSizeBytes() {
    return sizeBytesEstimate(this.labels);
  }
}

export interface TemporalDetectionLabel extends Classification {
  support: [number, number];
}

export class TemporalDetectionOverlay extends ClassificationsOverlay<
  VideoState,
  TemporalDetectionLabel | ClassificationLabel
> {
  getFiltered(state: Readonly<VideoState>) {
    return this.labels.map<
      [string, (TemporalDetectionLabel | ClassificationLabel)[]]
    >(([field, labels]) => {
      return [
        field,
        labels.filter((label) => {
          const shown = isShown(state, field, label) && label.label;

          if (!shown) {
            return false;
          }

          const cls = this.getCls(field, state);
          return filterTemporalLabel(cls, label, state.frameNumber);
        }),
      ];
    });
  }
}

export const filterTemporalLabel = (
  cls: string,
  label: ClassificationLabel | TemporalDetectionLabel,
  frameNumber: number
) => {
  if (!TEMPORAL_LABELS.has(cls)) {
    return true;
  }

  const temporal = label as TemporalDetectionLabel;

  if (temporal.support?.length !== 2) {
    return false;
  }

  return (
    temporal.support[0] <= frameNumber && temporal.support[1] >= frameNumber
  );
};

export const getClassificationPoints = (
  labels: ClassificationLabel[]
): Coordinates[] => {
  return [];
};

const getText = (_cls: string, label) => {
  if (_cls === REGRESSION) {
    return label.value;
  }

  return label.label;
};
