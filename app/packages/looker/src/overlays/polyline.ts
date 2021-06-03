/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { G, Polyline } from "@svgdotjs/svg.js";

import { MASK_ALPHA } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distanceFromLineSegment, getAlphaColor } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface PolylineLabel extends RegularLabel {
  points: Coordinates[][];
  closed: boolean;
  filled: boolean;
}

export default class PolylineOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, PolylineLabel> {
  private readonly g: G;
  private readonly polylines: Polyline[];
  private color: string;

  constructor(state: Readonly<State>, field: string, label: PolylineLabel) {
    super(field, label);
    this.color = this.getColor(state);

    const {
      config: {
        dimensions: [w, h],
      },
    } = state;
    this.g = new G();
    const alphaColor = getAlphaColor(this.color, MASK_ALPHA);
    this.polylines = this.label.points.map((points) => {
      const polyline = new Polyline().plot(
        points.map<[number, number]>(([x, y]) => [x * w, y * h])
      );
      polyline.stroke({ width: state.strokeWidth, color: this.color });

      if (this.label.filled) {
        polyline.fill(alphaColor);
      }
      return polyline;
    });
  }

  containsPoint(state, [x, y]) {
    return CONTAINS.NONE;
  }

  draw(context, state) {
    const color = this.getColor(state);
    if (this.color !== color) {
      this.color = color;
      const alphaColor = getAlphaColor(this.color, MASK_ALPHA);
      this.polylines.forEach((polyline) => {
        polyline.stroke({ color: this.color });

        if (this.label.filled) {
          polyline.fill(alphaColor);
        }
      });
    }
  }

  getMouseDistance(state, [x, y]) {
    const distances = [];
    const [w, h] = state.config.dimensions;
    for (const shape of this.label.points) {
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
    return Math.min(...distances);
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
