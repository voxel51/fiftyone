/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { INFO_COLOR, TOLERANCE } from "../constants";
import { BaseState, Coordinates, KeypointSkeleton } from "../state";
import { distance, distanceFromLineSegment, multiply } from "../util";
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
    if (this.getDistanceAndMaybePoint(state)[0] <= state.pointRadius) {
      return CONTAINS.BORDER;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    const color = this.getColor(state);
    const selected = this.isSelected(state);
    ctx.lineWidth = 0;

    const skeleton = getSkeleton(this.field, state);
    if (!skeleton) return;

    for (let i = 0; i < skeleton.edges.length; i++) {
      const path = skeleton.edges[i].map((index) => this.label.points[index]);
      this.strokePath(ctx, state, path, color);

      if (selected) {
        this.strokePath(ctx, state, path, INFO_COLOR, state.dashLength);
      }
    }

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
  }

  getMouseDistance(state: Readonly<State>): number {
    return this.getDistanceAndMaybePoint(state)[0];
  }

  getPointInfo(state: Readonly<State>): PointInfo<KeypointLabel> {
    const point = this.getDistanceAndMaybePoint(state)[1];
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      point:
        point !== null
          ? {
              coordinates: this.label.points[point],
              attributes: Object.entries(this.label)
                .filter(([_, v]) => Array.isArray(v))
                .map(([k, v]) => [k, v[point]]),
              index: point,
            }
          : null,
      type: "Keypoint",
    };
  }

  getPoints(): Coordinates[] {
    return getKeypointPoints([this.label]);
  }

  private getDistanceAndMaybePoint(
    state: Readonly<State>
  ): [number, number | null] {
    const distances = [];
    let {
      config: { dimensions },
      pointRadius,
      pixelCoordinates: [x, y],
    } = state;
    pointRadius = this.isSelected(state) ? pointRadius * 2 : pointRadius;
    for (let i = 0; i < this.label.points.length; i++) {
      const point = this.label.points[i];
      const d = distance(
        x,
        y,
        ...(multiply(dimensions, point) as [number, number])
      );
      if (d <= pointRadius * TOLERANCE) {
        distances.push([0, point]);
      } else {
        distances.push([d, point]);
      }
    }

    const skeleton = getSkeleton(this.field, state);

    if (skeleton) {
      for (let i = 0; i < skeleton.edges.length; i++) {
        const path = skeleton.edges[i].map((index) => this.label.points[index]);

        for (let j = 1; j < path.length; j++) {
          distances.push([
            distanceFromLineSegment(
              [x, y],
              multiply(dimensions, path[j - 1]),
              multiply(dimensions, path[j])
            ),
            null,
          ]);
        }
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
