/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import { NONFINITES } from "@fiftyone/utilities";

import {
  currentModalUniqueIdJotaiAtom,
  isHoveringParticularLabelWithInstanceConfig,
  jotaiStore,
} from "@fiftyone/state/src/jotai";
import { INFO_COLOR } from "../constants";
import { BaseState, BoundingBox, Coordinates, NONFINITE } from "../state";
import { distanceFromLineSegment } from "../util";
import { RENDER_STATUS_PAINTED, RENDER_STATUS_PENDING } from "../worker/shared";
import {
  CONTAINS,
  CoordinateOverlay,
  LabelMask,
  PointInfo,
  RegularLabel,
} from "./base";
import { getInstanceStrokeStyles, t } from "./util";

let cache: Record<
  string,
  {
    latestIndex: number;
    instanceIdToIndexId: Record<string, number>;
  }
> = {};
let lastModalUniqueId = "";

const getIndexIdFromInstanceIdForLabel = (
  instanceId: string,
  label: DetectionLabel
) => {
  const currentModalUniqueId = jotaiStore.get(currentModalUniqueIdJotaiAtom);

  if (currentModalUniqueId !== lastModalUniqueId) {
    lastModalUniqueId = currentModalUniqueId;
    cache = {};
  }

  const key = `${currentModalUniqueId}-${label.label.toLocaleLowerCase()}`;

  if (
    cache[key] &&
    cache[key].instanceIdToIndexId &&
    typeof cache[key].instanceIdToIndexId[instanceId] === "number"
  ) {
    return cache[key].instanceIdToIndexId[instanceId];
  } else if (cache[key] && cache[key].instanceIdToIndexId) {
    cache[key].instanceIdToIndexId[instanceId] = cache[key].latestIndex + 1;
    cache[key].latestIndex += 1;
    return cache[key].instanceIdToIndexId[instanceId];
  } else {
    cache[key] = {
      latestIndex: 1,
      instanceIdToIndexId: {
        [instanceId]: 1,
      },
    };
  }

  return cache[key].instanceIdToIndexId[instanceId];
};

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

  containsPoint(state: Readonly<State>): CONTAINS {
    if ((this.label.mask || this.label.mask_path) && !this.label.mask?.data) {
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
    if (this.label._renderStatus && !this.label.mask) {
      return;
    }

    if (this.label.mask && this.label._renderStatus === RENDER_STATUS_PENDING) {
      return;
    }

    const doesInstanceMatch =
      this.label.instance?._id &&
      isHoveringParticularLabelWithInstanceConfig(this.label.instance._id);
    const isSelected = this.isSelected(state);

    const { strokeColor, overlayStrokeColor, overlayDash } =
      getInstanceStrokeStyles({
        isSelected,
        getColor: () => this.getColor(state),
        isHoveringInstance: !!doesInstanceMatch,
        dashLength: state.dashLength,
      });

    if (
      this.label.mask?.bitmap?.width &&
      this.label._renderStatus === RENDER_STATUS_PAINTED
    ) {
      this.drawMask(ctx, state);
    }

    !state.config.thumbnail && this.drawLabelText(ctx, state);

    if (this.is3D && this.label.dimensions && this.label.location) {
      this.fillRectFor3d(ctx, state, strokeColor);
    } else {
      this.strokeRect(ctx, state, strokeColor);
    }

    if (overlayStrokeColor && overlayDash) {
      this.strokeRect(ctx, state, overlayStrokeColor, overlayDash);
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

    const hasIndex =
      (typeof this.label.index === "string" ||
        typeof this.label.index === "number") &&
      !isNaN(this.label.index);

    const hasInstanceId = Boolean(this.label.instance?._id);

    if (state.options.showIndex && (hasIndex || hasInstanceId)) {
      if (text.length > 0) {
        text += " ";
      }

      // index takes precedence over instance id
      if (hasIndex) {
        text += `${Number(this.label.index).toLocaleString()}`;
      } else {
        text += `${getIndexIdFromInstanceIdForLabel(
          this.label.instance._id,
          this.label
        )}`;
      }
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

  public cleanup(): void {
    this.label.mask?.bitmap?.close();
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
