/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { applyAlpha } from "../color";
import { BASE_ALPHA, DASH_COLOR, TOLERANCE } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distance } from "../util";
import { CONTAINS, CoordinateOverlay, PointInfo, RegularLabel } from "./base";
import { t } from "./util";

interface KeypointLabel extends RegularLabel {
  points: Coordinates[];
}

export default class KeypointOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, KeypointLabel> {
  constructor(field, label) {
    super(field, label);
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (this.getDistanceAndPoint(state)[0] <= state.pointRadius) {
      return CONTAINS.BORDER;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    const color = applyAlpha(
      this.getColor(state),
      state.options.alpha / BASE_ALPHA
    );
    const selected = this.isSelected(state);
    ctx.lineWidth = 0;

    for (const point of this.label.points) {
      ctx.fillStyle = color;
      ctx.beginPath();
      const [x, y] = t(state, ...point);
      ctx.arc(
        x,
        y,
        selected ? state.pointRadius * 2 : state.pointRadius,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (selected) {
        ctx.fillStyle = DASH_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, state.pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    return this.getDistanceAndPoint(state)[0];
  }

  getPointInfo(state: Readonly<State>): PointInfo<KeypointLabel> {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      point: this.getDistanceAndPoint(state)[1],
      type: "Keypoint",
    };
  }

  getPoints(): Coordinates[] {
    return getKeypointPoints([this.label]);
  }

  private getDistanceAndPoint(state: Readonly<State>) {
    const distances = [];
    let {
      canvasBBox: [_, __, w, h],
      pointRadius,
      relativeCoordinates: [x, y],
    } = state;
    pointRadius = this.isSelected(state) ? pointRadius * 2 : pointRadius;
    for (const [px, py] of this.label.points) {
      const d = distance(x * w, y * h, px * w, py * h);
      if (d <= pointRadius * TOLERANCE) {
        distances.push([0, [px, py]]);
      } else {
        distances.push([d, [px, py]]);
      }
    }

    return distances.sort((a, b) => a[0] - b[0])[0];
  }
}

export const getKeypointPoints = (labels: KeypointLabel[]): Coordinates[] => {
  let points = [];
  labels.forEach((label) => {
    points = [...points, ...label.points];
  });
  return points;
};
