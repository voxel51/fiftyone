/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { isHoveringParticularLabelWithInstanceConfig } from "@fiftyone/state/src/jotai";
import { INFO_COLOR, TOLERANCE } from "../constants";
import { BaseState, Coordinates } from "../state";
import { distanceFromLineSegment, getRenderedScale } from "../util";
import { CONTAINS, CoordinateOverlay, PointInfo, RegularLabel } from "./base";
import {
  getInstanceStrokeStyles,
  getLabelAttributesText,
  resolveLabelSelectionVisuals,
  t,
} from "./util";

export type PolylineLabel = RegularLabel & {
  _cls: "Polyline";
  points?: Coordinates[][];
  points3d?: Coordinates[][];
  closed?: boolean;
  filled?: boolean;
} & Record<string, unknown>;
export default class PolylineOverlay<
  State extends BaseState,
> extends CoordinateOverlay<State, PolylineLabel> {
  containsPoint(state: Readonly<State>): CONTAINS {
    // A lone vertex is hit-tested like a keypoint: the target is the drawn dot's
    // radius, not a stroke-width tolerance meant for lines. Without this the
    // clickable area is smaller than the dot you can see, so the label reads as
    // un-hoverable and un-selectable in Explore.
    if (this.loneVertexHit(state)) {
      return CONTAINS.BORDER;
    }

    const tolerance =
      (state.strokeWidth * TOLERANCE) /
      getRenderedScale(
        [state.windowBBox[2], state.windowBBox[3]],
        state.dimensions,
      );
    const minDistance = this.getMouseDistance(state);
    if (minDistance <= tolerance) {
      return CONTAINS.BORDER;
    }

    if (
      (this.label.closed || this.label.filled) &&
      (this.label.points || []).some((path) => this.isPointInPath(state, path))
    ) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    const color = this.getColor(state);
    const selected = this.isSelected(state);
    const labelVisuals = selected
      ? resolveLabelSelectionVisuals(this.label.id, state.options)
      : null;
    const doesInstanceMatch =
      this.label.instance?._id &&
      isHoveringParticularLabelWithInstanceConfig(this.label.instance._id);

    const { strokeColor, overlayStrokeColor, overlayDash } =
      getInstanceStrokeStyles({
        isSelected: selected,
        getColor: () => color,
        isHoveringInstance: !!doesInstanceMatch,
        dashLength: state.dashLength,
        labelSelectionColor: labelVisuals?.color,
      });

    for (const path of this.label.points || []) {
      // A single-vertex path has no segment to stroke, but it is still a real
      // shape the annotator drew — draw the vertex itself so it doesn't vanish
      // in Explore (it renders in Annotate, where vertices are drawn).
      if (path.length === 1) {
        this.drawVertex(ctx, state, path[0], strokeColor, selected);
        continue;
      }

      if (path.length < 2) {
        continue;
      }

      this.strokePath(ctx, state, path, strokeColor, this.label.filled);

      if (overlayStrokeColor && overlayDash) {
        this.strokePath(
          ctx,
          state,
          path,
          overlayStrokeColor,
          false,
          overlayDash,
        );
      }
    }

    !state.config.thumbnail && this.drawLabelText(ctx, state);
  }

  /**
   * Draws the label tag, matching `DetectionOverlay`'s tag styling so polylines
   * read the same as every other label in Explore (filled box in the label
   * colour, `INFO_COLOR` text, same padding).
   *
   * Anchored at the centroid of the shape's points — a polyline's bounding-box
   * corner can sit far from any actual geometry — except for a lone vertex,
   * where the tag is lifted clear of the dot so it doesn't hide it.
   */
  private drawLabelText(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    const labelText = this.getLabelText(state);

    if (!labelText.length) {
      return;
    }

    const points = (this.label.points || []).flat().filter(Boolean);

    if (!points.length) {
      return;
    }

    const isLoneVertex = points.length === 1;
    const anchor: Coordinates = isLoneVertex
      ? points[0]
      : [
          points.reduce((sum, p) => sum + p[0], 0) / points.length,
          points.reduce((sum, p) => sum + p[1], 0) / points.length,
        ];

    ctx.beginPath();
    ctx.fillStyle = this.getColor(state);

    let [ox, oy] = t(state, anchor[0], anchor[1]);
    // clear the dot for a lone vertex; centre the box on the centroid otherwise
    oy = isLoneVertex
      ? oy - state.pointRadius - state.strokeWidth
      : oy + state.fontSize / 2;

    ctx.moveTo(ox, oy);
    const { width } = ctx.measureText(labelText);
    const height = state.fontSize;
    const bpad = state.textPad * 3 + state.strokeWidth;
    const btrx = ox + width + bpad;
    const btry = oy - height - bpad;
    ctx.lineTo(btrx, oy);
    ctx.lineTo(btrx, btry);
    ctx.lineTo(ox, btry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = INFO_COLOR;
    const pad = state.textPad + state.strokeWidth;
    ctx.fillText(labelText, ox + pad, oy - pad);
  }

  private getLabelText(state: Readonly<State>): string {
    const attributes = state.options.shownLabelAttributes?.[this.field];

    return attributes
      ? getLabelAttributesText(
          this.label,
          attributes.filter((name) => name !== "points"),
        )
      : this.label.label
        ? `${this.label.label}`
        : "";
  }

  getMouseDistance(state: Readonly<State>): number {
    const distances = [];
    const [w, h] = state.dimensions;
    const xy = state.pixelCoordinates;
    for (const shape of this.label.points || []) {
      // No segments to measure against for a lone vertex — measure to the point
      // itself, otherwise a single-vertex polyline can never be hovered.
      if (shape.length === 1) {
        distances.push(
          Math.hypot(xy[0] - w * shape[0][0], xy[1] - h * shape[0][1]),
        );
        continue;
      }

      for (let i = 0; i < shape.length - 1; i++) {
        distances.push(
          distanceFromLineSegment(
            xy,
            [w * shape[i][0], h * shape[i][1]],
            [w * shape[i + 1][0], h * shape[i + 1][1]],
          ),
        );
      }
      // acheck final line segment if closed
      if (this.label.closed) {
        distances.push(
          distanceFromLineSegment(
            xy,
            [w * shape[0][0], h * shape[0][1]],
            [w * shape[shape.length - 1][0], h * shape[shape.length - 1][1]],
          ),
        );
      }
    }
    return Math.min(...distances);
  }

  getPointInfo(state: Readonly<State>): PointInfo<PolylineLabel> {
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

  /**
   * The cursor's hit against a single-vertex shape, or `null` when it isn't over
   * one. Mirrors `KeypointOverlay.getDistanceAndMaybePoint`: the radius is
   * `state.pointRadius * TOLERANCE`, doubled while selected, so the target
   * always matches the dot actually drawn. Distances are in image-pixel space
   * (`dimensions`-scaled vs `pixelCoordinates`) — NOT the `t()` draw space, which
   * is a different coordinate system and silently never matches.
   */
  private loneVertexHit(
    state: Readonly<State>,
  ): { coordinates: Coordinates; index: number } | null {
    const radius =
      (this.isSelected(state) ? state.pointRadius * 2 : state.pointRadius) *
      TOLERANCE;
    const [w, h] = state.dimensions;
    const [x, y] = state.pixelCoordinates;
    const shapes = this.label.points || [];

    for (let i = 0; i < shapes.length; i++) {
      if (shapes[i]?.length !== 1) {
        continue;
      }

      const [px, py] = shapes[i][0];
      if (Math.hypot(x - w * px, y - h * py) <= radius) {
        return { coordinates: shapes[i][0], index: i };
      }
    }

    return null;
  }

  /**
   * Draws a lone vertex as a filled dot, matching how `KeypointOverlay` draws
   * points (same `state.pointRadius`, same selected-size bump) so a
   * single-vertex polyline reads consistently with other point geometry.
   */
  private drawVertex(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    point: Coordinates,
    color: string,
    selected: boolean,
  ): void {
    const [x, y] = t(state, point[0], point[1]);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      selected ? state.pointRadius * 2 : state.pointRadius,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Selected dots get the same inner marker keypoints use, so selection is
    // visible on a shape that has no outline to restyle.
    if (selected) {
      ctx.fillStyle = INFO_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, state.pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private strokePath(
    ctx: CanvasRenderingContext2D,
    state: Readonly<State>,
    path: Coordinates[],
    color: string,
    filled: boolean,
    dash?: number,
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
      const tmp = ctx.globalAlpha;
      ctx.globalAlpha = state.options.alpha;
      ctx.fill();
      ctx.globalAlpha = tmp;
    }

    if (this.label.closed) {
      ctx.closePath();
    }
    ctx.stroke();
  }

  private isPointInPath(state: Readonly<State>, path: Coordinates[]): boolean {
    const [w, h] = state.dimensions;
    const [x, y] = state.pixelCoordinates;

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
    (label.points || []).forEach((line) => {
      points = [...points, ...line];
    });
  });
  return points;
};
