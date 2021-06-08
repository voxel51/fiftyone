/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { DASH_COLOR } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distance } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";
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

  private getDistanceAndPoint({
    pointRadius,
    config: {
      dimensions: [w, h],
    },
    pixelCoordinates: [x, y],
  }: Readonly<State>) {
    const distances = [];
    // this.radius = strokeWidth * KEYPOINT_RADIUS_FACTOR;
    for (const point of this.label.points) {
      const d = distance(x, y, point[0] * w, point[1] * h);
      if (d <= pointRadius) {
        distances.push([0, point]);
      } else {
        distances.push([d, point]);
      }
    }

    return distances.sort((a, b) => a[0] - b[0])[0];
  }

  containsPoint(state) {
    if (this.getDistanceAndPoint(state)[0] <= 2 * 8) {
      return CONTAINS.BORDER;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    const color = this.getColor(state);
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

  getMouseDistance(state) {
    return this.getDistanceAndPoint(state)[0];
  }

  getPointInfo(state) {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      point: this.getDistanceAndPoint(state)[1],
      type: "Keypoint",
    };
  }

  getPoints() {
    return getKeypointPoints([this.label]);
  }
}

export const getKeypointPoints = (labels: KeypointLabel[]): Coordinates[] => {
  let points = [];
  labels.forEach((label) => {
    points = [...points, ...label.points];
  });
  return points;
};
