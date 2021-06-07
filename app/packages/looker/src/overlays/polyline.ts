/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface PolylineLabel extends RegularLabel {
  points: Coordinates[][];
  closed: boolean;
  filled: boolean;
}

export default class PolylineOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, PolylineLabel> {
  private color: string;

  constructor(state: Readonly<State>, field: string, label: PolylineLabel) {
    super(field, label);
    this.color = this.getColor(state);
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    // const color = this.getColor(state);
  }

  getMouseDistance(state: Readonly<State>): number {
    const distances = [];
    const [w, h] = state.config.dimensions;
    /*for (const shape of this.label.points) {
      for (let i = 0; i < shape.length - 1; i++) {
        distances.push(
          distanceFromLineSegment(
            x,
            y,
            w * shape[i][0],
            h * shape[i][1],
            w * shape[i + 1][0],
            h * shape[i + 1][1]
          )
        );
      }
      // acheck final line segment if closed
      if (this.label.closed) {
        distances.push(
          distanceFromLineSegment(
            x,
            y,
            w * shape[0][0],
            h * shape[0][1],
            w * shape[shape.length - 1][0],
            h * shape[shape.length - 1][1]
          )
        );
      }
    }
    return Math.min(...distances)*/
    return Infinity;
  }

  getPointInfo() {
    return {
      field: this.field,
      label: this.label,
      type: "Polyline",
    };
  }

  getPoints() {
    return getPolylinePoints([this.label]);
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
