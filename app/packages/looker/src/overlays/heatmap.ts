/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import {
  get32BitColor,
  getColor,
  getRGBA,
  getRGBAColor,
  sizeBytesEstimate,
} from "@fiftyone/utilities";
import { ARRAY_TYPES, TypedArray } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { isFloatArray } from "../util";
import { clampedIndex } from "../worker/painter";
import {
  BaseLabel,
  CONTAINS,
  LabelMask,
  Overlay,
  PointInfo,
  SelectData,
  isShown,
} from "./base";
import { strokeCanvasRect, t } from "./util";

interface HeatmapLabel extends BaseLabel {
  map?: LabelMask;
  range?: [number, number];
}

interface HeatmapInfo extends BaseLabel {
  map?: {
    shape: [number, number];
  };
  range?: [number, number];
}

export default class HeatmapOverlay<State extends BaseState>
  implements Overlay<State>
{
  readonly field: string;
  readonly label: HeatmapLabel;
  private targets?: TypedArray;
  private readonly range: [number, number];

  constructor(field: string, label: HeatmapLabel) {
    this.field = field;
    this.label = label;

    if (!this.label.map?.data) {
      return;
    }

    this.targets = new ARRAY_TYPES[this.label.map.data.arrayType](
      this.label.map.data.buffer
    );
    this.range = this.label.range
      ? label.range
      : isFloatArray(this.targets)
      ? [0, 1]
      : [0, 255];
    const [height, width] = this.label.map.data.shape;

    if (!width || !height) {
      return;
    }
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (!this.label.map?.data) {
      return CONTAINS.NONE;
    }

    const {
      pixelCoordinates: [x, y],
      dimensions: [w, h],
    } = state;
    if (x >= 0 && x <= w && y >= 0 && y <= h && this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    if (this.label.map?.bitmap) {
      const [tlx, tly] = t(state, 0, 0);
      const [brx, bry] = t(state, 1, 1);
      const tmp = ctx.globalAlpha;
      ctx.globalAlpha = state.options.alpha;
      ctx.drawImage(this.label.map.bitmap, tlx, tly, brx - tlx, bry - tly);
      ctx.globalAlpha = tmp;
    }

    if (this.isSelected(state)) {
      strokeCanvasRect(
        ctx,
        state,
        getColor(
          state.options.coloring.pool,
          state.options.coloring.seed,
          this.field
        )
      );
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state: Readonly<State>): PointInfo<HeatmapInfo> {
    const target = this.getTarget(state);
    return {
      color: getRGBAColor(getRGBA(this.getColor(state, target))),
      label: {
        ...this.label,
        map: {
          shape: this.label.map ? this.label.map.data.shape : null,
        },
      },
      field: this.field,
      target,
      type: "Heatmap",
    };
  }

  getSelectData(): SelectData {
    return {
      id: this.label.id,
      field: this.field,
    };
  }

  isSelected(state: Readonly<State>): boolean {
    return state.options.selectedLabels.includes(this.label.id);
  }

  isShown(state: Readonly<State>): boolean {
    return isShown(state, this.field, this.label);
  }

  getPoints(): Coordinates[] {
    return getHeatmapPoints([]);
  }

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMapCoordinates(state);
    if (sx < 0 || sy < 0) {
      return -1;
    }
    return this.label.map.data.shape[1] * sy + sx;
  }

  private getMapCoordinates({
    pixelCoordinates: [x, y],
    dimensions: [mw, mh],
  }: Readonly<State>): Coordinates {
    const [h, w] = this.label.map.data.shape;
    const sx = Math.floor(x * (w / mw));
    const sy = Math.floor(y * (h / mh));
    return [sx, sy];
  }

  private getColor(state: Readonly<State>, value: number): number {
    const [start, stop] = this.range;

    if (value === 0) {
      return 0;
    }

    if (state.options.coloring.by === "value") {
      const index = clampedIndex(
        value,
        start,
        stop,
        state.options.coloring.scale.length
      );
      return index < 0 ? 0 : get32BitColor(state.options.coloring.scale[index]);
    }

    const color = getColor(
      state.options.coloring.pool,
      state.options.coloring.seed,
      this.field
    );
    const max = Math.max(Math.abs(start), Math.abs(stop));

    const result = Math.min(max, Math.abs(value)) / max;

    return get32BitColor(color, result / max);
  }

  private getTarget(state: Readonly<State>): number {
    const index = this.getIndex(state);

    if (index < 0) {
      return null;
    }

    if (this.label.map.data.channels > 1) {
      return this.targets[index * this.label.map.data.channels];
    }

    return this.targets[index];
  }

  getSizeBytes(): number {
    return sizeBytesEstimate(this.label);
  }

  public cleanup(setTargetsToNull = false): void {
    this.label.map?.bitmap?.close();

    if (setTargetsToNull) {
      this.targets = null;
    }
  }
}

export const getHeatmapPoints = (labels: HeatmapLabel[]): Coordinates[] => {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
};
