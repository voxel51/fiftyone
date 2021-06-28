/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  DASH_COLOR,
  DASH_LENGTH,
  MASK_ALPHA,
  SELECTED_MASK_ALPHA,
  TOLERANCE,
} from "../constants";
import { BaseState, Coordinates } from "../state";
import { distanceFromLineSegment } from "../util";
import { CONTAINS, CoordinateOverlay, PointInfo, RegularLabel } from "./base";
import { t } from "./util";

interface PolylineLabel extends RegularLabel {
  points: Coordinates[][];
  closed: boolean;
  filled: boolean;
}

export default class PolylineOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, PolylineLabel> {
  containsPoint(state: Readonly<State>): CONTAINS {
    const tolerance = state.strokeWidth * TOLERANCE;
    const minDistance = this.getMouseDistance(state);
    if (minDistance <= tolerance) {
      return CONTAINS.BORDER;
    }

    if (
      (this.label.closed || this.label.filled) &&
      this.label.points.some((path) => this.isPointInPath(state, path))
    ) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    const color = this.getColor(state);
    const selected = this.isSelected(state);

    for (const path of this.label.points) {
      if (path.length < 2) {
        continue;
      }

      if (selected) {
        this.strokePath(ctx, state, path, DASH_COLOR, false, false);
      }

      this.strokePath(
        ctx,
        state,
        path,
        color,
        this.label.filled,
        selected,
        selected ? DASH_LENGTH : null
      );
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    const distances = [];
    const [_, __, w, h] = state.canvasBBox;
    const xy: Coordinates = [
      state.relativeCoordinates[0] * w,
      state.relativeCoordinates[1] * h,
    ];
    for (const shape of this.label.points) {
      for (let i = 0; i < shape.length - 1; i++) {
        distances.push(
          distanceFromLineSegment(
            xy,
            [w * shape[i][0], h * shape[i][1]],
            [w * shape[i + 1][0], h * shape[i + 1][1]]
          )
        );
      }
      // acheck final line segment if closed
      if (this.label.closed) {
        distances.push(
          distanceFromLineSegment(
            xy,
            [w * shape[0][0], h * shape[0][1]],
            [w * shape[shape.length - 1][0], h * shape[shape.length - 1][1]]
          )
        );
      }
    }
    return Math.min(...distances);
  }

  getPointInfo(state: Readonly<State>): PointInfo {
    return {
      field: this.field,
      label: this.label,
      type: "Polyline",
      color: this.getColor(state),
    };
  }

  getPoints(): Coordinates[] {
    return getPolylinePoints([this.label]);
  }

  private strokePath(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    path: Coordinates[],
    color: string,
    filled: boolean,
    selected: boolean,
    dash?: number
  ) {
    ctx.beginPath();
    ctx.lineWidth = state.strokeWidth;
    ctx.strokeStyle = color;
    ctx.setLineDash(dash ? [dash] : []);
    ctx.moveTo(...t(state, path[0][0], path[0][1]));
    for (const [x, y] of path.slice(1)) {
      ctx.lineTo(...t(state, x, y));
    }
    if (filled) {
      ctx.fillStyle = color;
      ctx.globalAlpha = selected ? SELECTED_MASK_ALPHA : MASK_ALPHA;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.label.closed) {
      ctx.closePath();
    }
    ctx.stroke();
  }

  private isPointInPath(state: Readonly<State>, path: Coordinates[]): boolean {
    const [_, __, w, h] = state.canvasBBox;
    const [x, y] = [
      state.relativeCoordinates[0] * w,
      state.relativeCoordinates[1] * h,
    ];

    let inside = false;
    if (this.label.closed) {
      path = [...path, path[0]];
    }
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      let xi = path[i][0],
        yi = path[i][1];
      let xj = path[j][0],
        yj = path[j][1];

      [xi, yi] = [xi * w, yi * h];
      [xj, yj] = [xj * w, yj * h];

      const intersect =
        yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }
}

export const getPolylinePoints = (labels: PolylineLabel[]): Coordinates[] => {
  let points = [];
  labels.forEach((label) => {
    label.points.forEach((line) => {
      points = [...points, ...line];
    });
  });
  return points;
};
