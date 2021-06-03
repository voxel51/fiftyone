/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Circle, G } from "@svgdotjs/svg.js";
import { KEYPOINT_RADIUS_FACTOR } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distance } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface KeypointLabel extends RegularLabel {
  points: Coordinates[];
}

export default class KeypointOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, KeypointLabel> {
  private readonly g: G;
  private color: string;
  private radius: number;
  private circles: Circle[];

  constructor(state, field, label) {
    super(field, label);
    this.color = this.getColor(state);

    this.g = new G();

    const radius = state.strokeWidth * KEYPOINT_RADIUS_FACTOR;
    const [w, h] = state.config.dimensions;
    this.circles = this.label.points.map(([x, y]) => {
      const circle = new Circle()
        .radius(radius)
        .center(x * w, y * h)
        .fill(this.color);
      this.g.add(circle);
      return circle;
    });
  }

  private getDistanceAndPoint(
    {
      strokeWidth,
      config: {
        dimensions: [w, h],
      },
    },
    [x, y]: Coordinates
  ) {
    const distances = [];
    this.radius = strokeWidth * KEYPOINT_RADIUS_FACTOR;
    for (const point of this.label.points) {
      const d = distance(x, y, point[0] * w, point[1] * h);
      if (d <= this.radius) {
        distances.push([0, point]);
      } else {
        distances.push([d, point]);
      }
    }

    return distances.sort((a, b) => a[0] - b[0])[0];
  }

  containsPoint(state, [x, y]) {
    if (this.getDistanceAndPoint(state, [x, y])[0] <= 2 * this.radius) {
      return CONTAINS.BORDER;
    }
    return CONTAINS.NONE;
  }

  draw(svg, state) {
    const color = this.getColor(state);
    if (color !== this.getColor(state)) {
      this.color = color;
      this.circles.forEach((c) => {
        c.fill(color);
      });
    }

    const radius = state.strokeWidth * KEYPOINT_RADIUS_FACTOR;
    if (this.radius !== radius) {
      this.radius = radius;
      this.circles.forEach((c) => {
        c.radius(radius);
      });
    }
    console.log(this.circles);
    svg.add(this.g);
  }

  getMouseDistance(state, [x, y]) {
    return this.getDistanceAndPoint(state, [x, y])[0];
  }

  getPointInfo(state, [x, y]) {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      point: this.getDistanceAndPoint(state, [x, y])[1],
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
