/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { getColorscaleArray, getRGBAColor } from "../color";
import { ARRAY_TYPES, NumpyResult, TypedArray } from "../numpy";
import { BaseState, Coordinates, RGB } from "../state";
import { BaseLabel, CONTAINS, Overlay, PointInfo, SelectData } from "./base";
import { sizeBytes, t } from "./util";

interface HeatmapLabel extends BaseLabel {
  map?: NumpyResult;
  range?: [number, number];
}

export default class HeatmapOverlay<State extends BaseState>
  implements Overlay<State> {
  readonly field: string;
  private readonly label: HeatmapLabel;
  private targets?: TypedArray;
  private readonly range: [number, number];
  private colorscale?: RGB[];
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;

  constructor(field: string, label: HeatmapLabel) {
    this.field = field;
    this.label = label;
    if (this.label.map) {
      this.targets = new ARRAY_TYPES[this.label.map.arrayType](
        this.label.map.buffer
      );

      const isFloatArray = (arr) =>
        arr instanceof Float32Array || arr instanceof Float64Array;

      this.range = this.label.range
        ? this.label.range
        : isFloatArray(this.targets)
        ? [0, 1]
        : [0, 255];

      const [height, width] = this.label.map.shape;
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
      this.imageData = new ImageData(width, height);
    }
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    if (this.targets && this.colorscale !== state.options.colorscale) {
      this.colorscale = state.options.colorscale;
      const imageMask = new Uint32Array(this.imageData.data.buffer);

      const [start, stop] = this.range;
      const max = Math.max(Math.abs(start), Math.abs(stop));
      for (let i = 0; i < this.targets.length; i++) {
        if (this.targets[i] !== 0) {
          let value = Math.min(max, Math.max(this.targets[i], 0)) / max;
          value *= colors.length;

          imageMask[i] = colors[Math.round(value)];
        }
      }

      const maskCtx = this.canvas.getContext("2d");
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(0, 0, this.label.map.shape[1], this.label.map.shape[0]);
      maskCtx.putImageData(this.imageData, 0, 0);
    }
    const [tlx, tly] = t(state, 0, 0);
    const [brx, bry] = t(state, 1, 1);
    ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);
  }

  getMouseDistance(state: Readonly<State>): number {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state: Readonly<State>): PointInfo {
    const target = this.getTarget(state);
    return {
      color: getRGBAColor(this.getColor(state)(target)),
      label: {
        ...this.label,
        map: {
          shape: this.label.map.shape ? this.label.map.shape : null,
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
    return state.options.activePaths.includes(this.field);
  }

  getPoints(): Coordinates[] {
    return getHeatmapPoints([]);
  }

  getSizeBytes(): number {
    return sizeBytes(this.label);
  }

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMapCoordinates(state);
    return this.label.map.shape[1] * sy + sx;
  }

  private getMapCoordinates({
    pixelCoordinates: [x, y],
    config: {
      dimensions: [mw, mh],
    },
  }: Readonly<State>): Coordinates {
    const [h, w] = this.label.map.shape;
    const sx = Math.floor(x * (w / mw));
    const sy = Math.floor(y * (h / mh));
    return [sx, sy];
  }

  private getColor(state: Readonly<State>): (value: number) => number {
    const [start, stop] = this.range;
    const max = Math.max(Math.abs(start), Math.abs(stop));

    const colorscale = this.colorscale
      ? getColorscaleArray(this.colorscale)
      : null;
    const color = state.options.colorMap(this.field);

    return (value) => {
      if (value === 0) {
        return 0;
      }

      if (colorscale) {
      }

      value = Math.min(max, Math.max(value, 0)) / max;
      value *= colors.length;

      return Math.round(value);
    };
  }

  private getTarget(state: Readonly<State>): number {
    const index = this.getIndex(state);
    return this.targets[index];
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
