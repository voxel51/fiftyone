/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { get32BitColor } from "../color";
import { DASH_COLOR, MASK_ALPHA, TEXT_COLOR } from "../constants";

import { ARRAY_TYPES, NumpyResult, TypedArray } from "../numpy";
import { BaseState, BoundingBox, Coordinates } from "../state";
import { distanceFromLineSegment } from "../util";
import { CONTAINS, CoordinateOverlay, PointInfo, RegularLabel } from "./base";
import { t } from "./util";

interface DetectionLabel extends RegularLabel {
  mask?: NumpyResult;
  bounding_box: BoundingBox;
}

export default class DetectionOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel> {
  private imageData: ImageData;
  private labelBoundingBox: BoundingBox;
  private mask: TypedArray;
  private bitColor: number;
  private canvas: HTMLCanvasElement;

  constructor(field, label) {
    super(field, label);
    if (this.label.mask) {
      this.mask = new ARRAY_TYPES[this.label.mask.arrayType](
        this.label.mask.buffer
      );
      const [height, width] = this.label.mask.shape;
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
      this.imageData = new ImageData(width, height);
    }
  }

  containsPoint(state: Readonly<State>): CONTAINS {
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
    this.label.mask && this.drawMask(ctx, state);

    !state.config.thumbnail && this.drawLabelText(ctx, state);
    this.strokeRect(ctx, state, this.getColor(state));

    if (this.isSelected(state)) {
      this.strokeRect(ctx, state, DASH_COLOR, state.dashLength);
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

  getPointInfo(state: Readonly<State>): PointInfo {
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
    ctx.fillStyle = TEXT_COLOR;
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
    const bitColor = get32BitColor(this.getColor(state), MASK_ALPHA);
    const imagePixels = new Uint32Array(this.imageData.data.buffer);
    if (this.bitColor !== bitColor) {
      this.bitColor = bitColor;
      for (let i = 0; i < this.mask.length; i++) {
        this.mask[i] && (imagePixels[i] = bitColor);
      }
      this.bitColor = bitColor;

      const maskCtx = this.canvas.getContext("2d");
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(
        0,
        0,
        this.label.mask.shape[1],
        this.label.mask.shape[0]
      );
      maskCtx.putImageData(this.imageData, 0, 0);
    }
    const [tlx, tly, w, h] = this.label.bounding_box;
    const [x, y] = t(state, tlx, tly);

    ctx.drawImage(
      this.canvas,
      x,
      y,
      w * state.canvasBBox[2],
      h * state.canvasBBox[3]
    );
  }

  private getLabelText(state: Readonly<State>): string {
    let text =
      this.label.label && state.options.showLabel ? `${this.label.label}` : "";

    if (state.options.showIndex && !isNaN(this.label.index)) {
      text.length && (text += " ");
      text += `${Number(this.label.index).toLocaleString()}`;
    }

    if (state.options.showConfidence && !isNaN(this.label.confidence)) {
      text.length && (text += " ");
      text += `(${Number(this.label.confidence).toFixed(2)})`;
    }

    return text;
  }

  private isInHeader(state: Readonly<State>) {
    if (!this.labelBoundingBox) {
      return false;
    }

    const [w, h] = state.config.dimensions;
    const [px, py] = state.pixelCoordinates;
    let [bx, by, bw, bh] = this.labelBoundingBox;
    [bx, by, bw, bh] = [bx * w, by * h, bw * w, bh * h];

    return px >= bx && py >= by && px <= bx + bw && py <= by + bh;
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
    const [w, h] = state.config.dimensions;
    let [bx, by, bw, bh] = this.label.bounding_box;

    const ow = state.strokeWidth / state.canvasBBox[2];
    const oh = state.strokeWidth / state.canvasBBox[3];
    return [(bx - ow) * w, (by - oh) * h, (bw + ow * 2) * w, (bh + oh * 2) * h];
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
