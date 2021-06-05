/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { get32BitColor, getAlphaColor } from "../color";
import {
  BACKGROUND_ALPHA,
  MASK_ALPHA,
  TEXT_BG_COLOR,
  TEXT_COLOR,
} from "../constants";

import { deserialize, NumpyResult } from "../numpy";
import { BaseState, BoundingBox, Coordinates } from "../state";
import { distanceFromLineSegment, ensureCanvasSize } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";
import { t } from "./util";

interface DetectionLabel extends RegularLabel {
  mask?: string;
  bounding_box: BoundingBox;
}

export default class DetectionOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel> {
  private static readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  private readonly mask: NumpyResult;

  constructor(config, field, label) {
    super(field, label);
  }

  containsPoint(state) {
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state) {
    const color = this.getColor(state);
    const [tlx, tly, w, h] = this.label.bounding_box;
    const labelText = this.getLabelText(state);
    if (!state.config.thumbnail && labelText.length) {
      ctx.beginPath();
      ctx.fillStyle = getAlphaColor(color, BACKGROUND_ALPHA);
      ctx.fillStyle = TEXT_BG_COLOR;
      const [ox, oy] = t(state, tlx, tly);
      ctx.moveTo(ox, oy);
      const { width, actualBoundingBoxDescent: height } = ctx.measureText(
        labelText
      );
      const bpad = state.textPad * 2 + state.strokeWidth;
      const bbrx = ox + width + bpad;
      const bbry = oy + height + bpad;
      ctx.lineTo(bbrx, oy);
      ctx.lineTo(bbrx, bbry);
      ctx.lineTo(ox, bbry);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = TEXT_COLOR;
      const pad = state.textPad + state.strokeWidth;
      ctx.fillText(labelText, ox + pad, oy + pad);
    }

    ctx.beginPath();
    ctx.strokeStyle = this.getColor(state);
    ctx.lineWidth = state.strokeWidth;
    ctx.moveTo(...t(state, tlx, tly));
    ctx.lineTo(...t(state, tlx + w, tly));
    ctx.lineTo(...t(state, tlx + w, tly + h));
    ctx.lineTo(...t(state, tlx, tly + h));
    ctx.closePath();
    ctx.stroke();
  }

  getMouseDistance({
    config: {
      dimensions: [w, h],
    },
    pixelCoordinates: [x, y],
  }) {
    const [bx, by, bw, bh] = this.label.bounding_box;
    x /= w;
    y /= h;

    const distances = [
      distanceFromLineSegment(x, y, bx, by, bx + bw, by),
      distanceFromLineSegment(x, y, bx, by, bx, by + bh),
      distanceFromLineSegment(x, y, bx + bw, by + bh, bx + bw, by),
      distanceFromLineSegment(x, y, bx + bw, by + bh, bx, by + bh),
    ];
    return Math.min(...distances);
  }

  getPointInfo(state) {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      type: "Detection",
    };
  }

  getPoints() {
    return getDetectionPoints([this.label]);
  }

  private getLabelText(state: Readonly<State>): string {
    let text =
      this.label.label && state.options.showLabel ? `${this.label.label} ` : "";

    if (state.options.showConfidence && !isNaN(this.label.confidence)) {
      text += `(${Number(this.label.confidence).toFixed(2)})`;
    }
    return text;
  }
}

export const getDetectionPoints = (labels: DetectionLabel[]): Coordinates[] => {
  let points: Coordinates[] = [];
  labels.forEach((label) => {
    const [tlx, tly, w, h] = label.bounding_box;
    points = [
      ...points,
      [tlx, tly],
      [tlx + w, tly],
      [tlx + w, tly + h],
      [tlx, tly + h],
    ];
  });
  return points;
};
