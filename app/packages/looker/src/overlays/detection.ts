/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import { NONFINITES } from "@fiftyone/utilities";

import { INFO_COLOR } from "../constants";
import { BaseState, BoundingBox, Coordinates, NONFINITE } from "../state";
import { distanceFromLineSegment } from "../util";
import {
  CONTAINS,
  CoordinateOverlay,
  LabelMask,
  PointInfo,
  RegularLabel,
} from "./base";
import { t } from "./util";

export interface DetectionLabel extends RegularLabel {
  mask?: LabelMask;
  mask_path?: string;
  bounding_box: BoundingBox;

  // valid for 3D bounding boxes
  dimensions?: [number, number, number];
  location?: [number, number, number];
  rotation?: [number, number, number];
  convexHull?: Coordinates[];
}

export default class DetectionOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel> {
  private is3D: boolean;
  private labelBoundingBox: BoundingBox;

  constructor(field, label) {
    super(field, label);

    if (this.label.location && this.label.dimensions) {
      this.is3D = true;
    } else {
      this.is3D = false;
    }
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if ((this.label.mask || this.label.mask_path) && this.label.mask?.data) {
      return CONTAINS.NONE;
    }

    const [bx, by, bw, bh] = this.getDrawnBBox(state);

    const [px, py] = state.pixelCoordinates;

    if (px >= bx && py >= by && px <= bx + bw && py <= by + bh) {
      return CONTAINS.CONTENT;
    }

    if (this.isInHeader(state)) {
      return CONTAINS.BORDER;
    }

    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    // renderstatus is guaranteed to be undefined when there is no mask_path
    // so if render status is not null, means there's a mask
    // we want to couple rendering of mask with bbox
    // so we return if render status is truthy and there's no mask
    // meaning mask is being processed
    if (this.label.renderStatus && !this.label.mask) {
      return;
    }

    if (this.label.mask && this.label.renderStatus === "painted") {
      this.drawMask(ctx, state);
    }

    !state.config.thumbnail && this.drawLabelText(ctx, state);

    if (this.is3D && this.label.dimensions && this.label.location) {
      this.fillRectFor3d(ctx, state, this.getColor(state));
    } else {
      this.strokeRect(ctx, state, this.getColor(state));
    }

    if (this.isSelected(state)) {
      this.strokeRect(ctx, state, INFO_COLOR, state.dashLength);
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    const [px, py] = state.pixelCoordinates;
    const [bx, by, bw, bh] = this.getDrawnBBox(state);

    if (this.isInHeader(state)) {
      return 0;
    }

    const distances = [
      distanceFromLineSegment([px, py], [bx, by], [bx + bw, by]),
      distanceFromLineSegment([px, py], [bx + bw, by], [bx + bw, by + bh]),
      distanceFromLineSegment([px, py], [bx + bw, by + bh], [bx, by + bh]),
      distanceFromLineSegment([px, py], [bx, by + bh], [bx, by]),
    ];

    return Math.min(...distances);
  }

  getPointInfo(state: Readonly<State>): PointInfo<DetectionLabel> {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      type: "Detection",
    };
  }

  getPoints(): Coordinates[] {
    return getDetectionPoints([this.label]);
  }

  private drawLabelText(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    const labelText = this.getLabelText(state);
    if (!labelText.length) {
      this.labelBoundingBox = null;
      return;
    }

    const color = this.getColor(state);

    const [tlx, tly, _, __] = this.label.bounding_box;
    ctx.beginPath();
    ctx.fillStyle = color;
    let [ox, oy] = t(state, tlx, tly);
    [ox, oy] = [ox - state.strokeWidth / 2, oy];
    ctx.moveTo(ox, oy);
    const { width } = ctx.measureText(labelText);
    const height = state.fontSize;
    const bpad = state.textPad * 3 + state.strokeWidth;
    const btrx = ox + width + bpad;
    const btry = oy - height - bpad;
    ctx.lineTo(btrx, oy);
    ctx.lineTo(btrx, btry);
    ctx.lineTo(ox, btry);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INFO_COLOR;
    const pad = state.textPad + state.strokeWidth;
    ctx.fillText(labelText, ox + pad, oy - pad);

    const rHeight = (height + bpad) / state.canvasBBox[3];
    this.labelBoundingBox = [
      tlx - state.strokeWidth / state.canvasBBox[2],
      tly - rHeight,
      (width + bpad + state.strokeWidth / 2) / state.canvasBBox[2],
      rHeight + state.strokeWidth / state.canvasBBox[3],
    ];
  }

  private drawMask(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    if (!this.label.mask?.bitmap) {
      return;
    }

    const [tlx, tly, w, h] = this.label.bounding_box;
    const [x, y] = t(state, tlx, tly);
    const tmp = ctx.globalAlpha;
    ctx.globalAlpha = state.options.alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.label.mask.bitmap,
      x,
      y,
      w * state.canvasBBox[2],
      h * state.canvasBBox[3]
    );
    ctx.globalAlpha = tmp;
  }

  private getLabelText(state: Readonly<State>): string {
    let text =
      this.label.label && state.options.showLabel ? `${this.label.label}` : "";

    if (state.options.showIndex && !isNaN(this.label.index)) {
      text.length && (text += " ");
      text += `${Number(this.label.index).toLocaleString()}`;
    }

    if (
      state.options.showConfidence &&
      (!isNaN(this.label.confidence as number) ||
        NONFINITES.has(this.label.confidence as NONFINITE))
    ) {
      text.length && (text += " ");
      text += `(${
        typeof this.label.confidence === "number"
          ? Number(this.label.confidence).toFixed(2)
          : this.label.confidence
      })`;
    }

    return text;
  }

  private isInHeader(state: Readonly<State>) {
    if (!this.labelBoundingBox) {
      return false;
    }

    const [w, h] = state.dimensions;
    const [px, py] = state.pixelCoordinates;
    let [bx, by, bw, bh] = this.labelBoundingBox;
    [bx, by, bw, bh] = [bx * w, by * h, bw * w, bh * h];

    return px >= bx && py >= by && px <= bx + bw && py <= by + bh;
  }

  private fillRectFor3d(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    color: string
  ) {
    const convexHull = this.label.convexHull;

    const previousAlpha = ctx.globalAlpha;
    // use double stoke width to make the box more visible
    ctx.lineWidth = state.strokeWidth * 2;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    ctx.beginPath();

    // draw a polyline that defines the convex hull of the projected corners and fill it
    ctx.moveTo(...t(state, convexHull[0][0], convexHull[0][1]));
    for (let i = 1; i < convexHull.length; i++) {
      ctx.lineTo(...t(state, convexHull[i][0], convexHull[i][1]));
    }

    ctx.closePath();
    ctx.stroke();

    // fill with some transparency
    ctx.globalAlpha = state.options.alpha * 0.3;

    ctx.fill();

    // restore previous alpha
    ctx.globalAlpha = previousAlpha;
  }

  private strokeRect(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    color: string,
    dash?: number
  ) {
    const [tlx, tly, w, h] = this.label.bounding_box;
    ctx.beginPath();
    ctx.lineWidth = state.strokeWidth;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash ? [dash] : []);
    ctx.moveTo(...t(state, tlx, tly));
    ctx.lineTo(...t(state, tlx + w, tly));
    ctx.lineTo(...t(state, tlx + w, tly + h));
    ctx.lineTo(...t(state, tlx, tly + h));
    ctx.closePath();
    ctx.stroke();
  }

  private getDrawnBBox(state: Readonly<State>): BoundingBox {
    const [w, h] = state.dimensions;
    const [bx, by, bw, bh] = this.label.bounding_box;

    const ow = state.strokeWidth / state.canvasBBox[2];
    const oh = state.strokeWidth / state.canvasBBox[3];
    return [(bx - ow) * w, (by - oh) * h, (bw + ow * 2) * w, (bh + oh * 2) * h];
  }

  public cleanup(setTargetsToNull = false): void {
    this.label.mask?.bitmap?.close();

    if (setTargetsToNull && this.label.mask) {
      this.label.mask = null;
    }
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
