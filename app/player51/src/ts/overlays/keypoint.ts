/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { DASH_COLOR, POINT_RADIUS } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distance } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface KeypointLabel extends RegularLabel {
  points: Coordinates[];
}

export default class KeypointOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, KeypointLabel> {
  constructor(field, label) {
    super(field, label);
  }

  private getDistanceAndPoint = function ([x, y]: Coordinates) {
    const distances = [];
    for (const point of this.points) {
      const d = distance(x, y, point[0] * this.w, point[1] * this.h);
      if (d <= POINT_RADIUS) {
        distances.push([0, point]);
      } else {
        distances.push([d, point]);
      }
    }

    return distances.sort((a, b) => a[0] - b[0])[0];
  };

  containsPoint(context, state, [x, y]) {
    if (this.getDistanceAndPoint([x, y])[0] <= 2 * POINT_RADIUS) {
      return CONTAINS.BORDER;
    }
    return CONTAINS.NONE;
  }

  draw(context, state) {
    const color = this.getColor(state);
    context.lineWidth = 0;
    const isSelected = this.isSelected(state);

    const [canvasWidth, canvasHeight] = [
      context.canvas.width,
      context.canvas.height,
    ];

    for (const point of this.label.points) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(
        point[0] * canvasWidth,
        point[1] * canvasHeight,
        isSelected ? POINT_RADIUS * 2 : POINT_RADIUS,
        0,
        Math.PI * 2
      );
      context.fill();

      if (isSelected) {
        context.fillStyle = DASH_COLOR;
        context.beginPath();
        context.arc(
          point[0] * canvasWidth,
          point[1] * canvasHeight,
          POINT_RADIUS,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }
  }

  getMouseDistance(context, state, [x, y]) {
    return this.getDistanceAndPoint([x, y])[0];
  }

  getPointInfo(context, state, [x, y]) {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      point: this.getDistanceAndPoint([x, y])[1],
      type: "Keypoint",
    };
  }
}
