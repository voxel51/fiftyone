/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { DASH_COLOR, DASH_LENGTH, LINE_WIDTH, MASK_ALPHA } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distanceFromLineSegment } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface PolylineLabel extends RegularLabel {
  points: Coordinates[][];
  closed: boolean;
  filled: boolean;
}

export default class PolylineOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, PolylineLabel> {
  private path: Path2D;
  private lastWidth: number;
  private lastHeight: number;

  constructor(field: string, label: PolylineLabel) {
    super(field, label);
  }

  private setup(width: number, height: number) {
    this.path = new Path2D();
    for (const shape of this.label.points) {
      const shapePath = new Path2D();
      for (const [pidx, point] of Object.entries(shape)) {
        if (Number(pidx) > 0) {
          shapePath.lineTo(height * point[0], height * point[1]);
        } else {
          shapePath.moveTo(width * point[0], height * point[1]);
        }
      }
      if (this.label.closed) {
        shapePath.closePath();
      }
      this.path.addPath(shapePath);
    }
  }

  containsPoint(state, context, [x, y]) {
    const tolerance = LINE_WIDTH * 1.5;
    const minDistance = this.getMouseDistance(context, state, [x, y]);
    if (minDistance <= tolerance) {
      return CONTAINS.BORDER;
    }

    if (this.label.closed || this.label.filled) {
      return context.isPointInPath(this.path, x, y)
        ? CONTAINS.CONTENT
        : CONTAINS.NONE;
    }
    return CONTAINS.NONE;
  }

  draw(context, state) {
    const [width, height] = [context.canvas.width, context.canvas.height];
    if (!this.path || width !== this.lastWidth || height !== this.lastHeight) {
      this.setup(width, height);
      this.lastWidth = width;
      this.lastHeight = height;
    }

    const color = this.getColor(state);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = LINE_WIDTH;
    context.stroke(this.path);
    if (this.isSelected(state)) {
      context.strokeStyle = DASH_COLOR;
      context.setLineDash([DASH_LENGTH]);
      context.stroke(this.path);
      context.strokeStyle = color;
      context.setLineDash([]);
    }
    if (this.label.filled) {
      context.globalAlpha = MASK_ALPHA;
      context.fill(this.path);
      context.globalAlpha = 1;
    }
  }

  getMouseDistance(context, state, [x, y]) {
    const distances = [];
    const [w, h] = [context.canvas.width, context.canvas.height];
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
}
