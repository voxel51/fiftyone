/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import {
  get32BitColor,
  getColor,
  getRGBA,
  getRGBAColor,
} from "@fiftyone/utilities";
import { ARRAY_TYPES, OverlayMask, TypedArray } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { isFloatArray } from "../util";
import {
  BaseLabel,
  CONTAINS,
  isShown,
  Overlay,
  PointInfo,
  SelectData,
} from "./base";
import { sizeBytes, strokeCanvasRect, t } from "./util";

interface HeatMap {
  data: OverlayMask;
  image: ArrayBuffer;
}

interface HeatmapLabel extends BaseLabel {
  map?: HeatMap;
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
  private label: HeatmapLabel;
  private targets?: TypedArray;
  private readonly range: [number, number];
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;

  constructor(field: string, label: HeatmapLabel) {
    this.field = field;
    this.label = label;
    if (!this.label.map) {
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

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    this.imageData = new ImageData(
      new Uint8ClampedArray(this.label.map.image),
      width,
      height
    );
    const maskCtx = this.canvas.getContext("2d");
    maskCtx.imageSmoothingEnabled = false;
    maskCtx.clearRect(
      0,
      0,
      this.label.map.data.shape[1],
      this.label.map.data.shape[0]
    );
    maskCtx.putImageData(this.imageData, 0, 0);
  }

  containsPoint(state: Readonly<State>): CONTAINS {
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
    if (this.imageData) {
      const maskCtx = this.canvas.getContext("2d");
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(
        0,
        0,
        this.label.map.data.shape[1],
        this.label.map.data.shape[0]
      );
      maskCtx.putImageData(this.imageData, 0, 0);

      const [tlx, tly] = t(state, 0, 0);
      const [brx, bry] = t(state, 1, 1);
      const tmp = ctx.globalAlpha;
      ctx.globalAlpha = state.options.alpha;
      ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);
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

  getSizeBytes(): number {
    return sizeBytes(this.label);
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
      const index = Math.round(
        (Math.max(value - start, 0) / (stop - start)) *
          (state.options.coloring.scale.length - 1)
      );

      return get32BitColor(state.options.coloring.scale[index]);
    }

    const color = getColor(
      state.options.coloring.pool,
      state.options.coloring.seed,
      this.field
    );
    const max = Math.max(Math.abs(start), Math.abs(stop));

    value = Math.min(max, Math.abs(value)) / max;

    return get32BitColor(color, value / max);
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
}

export const getHeatmapPoints = (labels: HeatmapLabel[]): Coordinates[] => {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
};
