/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { INFO_COLOR, TOLERANCE } from "../constants";
import { BaseState, Coordinates, KeypointSkeleton } from "../state";
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
    const color = this.getColor(state);
    const selected = this.isSelected(state);
    ctx.lineWidth = 0;

    for (let i = 0; i < this.label.points.length; i++) {
      const point = this.label.points[i];
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
        ctx.fillStyle = INFO_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, state.pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const skeleton = getSkeleton(this.field, state);

    if (!skeleton) return;

    for (let i = 0; i < skeleton.edges.length; i++) {
      const path = skeleton.edges[i].map((index) => this.label.points[index]);
      this.strokePath(ctx, state, path, color, selected);

      if (selected) {
        this.strokePath(ctx, state, path, INFO_COLOR, state.dashLength);
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

  private strokePath(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    path: Coordinates[],
    color: string,
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

    ctx.stroke();
  }
}

export const getKeypointPoints = (labels: KeypointLabel[]): Coordinates[] => {
  let points = [];
  labels.forEach((label) => {
    points = [...points, ...label.points];
  });
  return points;
};

const getSkeleton = (
  name: string,
  state: BaseState
): KeypointSkeleton | null => {
  const defaultSkeleton = state.options.defaultSkeleton;

  const namedSkeleton = state.options.skeletons[name];

  return namedSkeleton || defaultSkeleton || null;
};
