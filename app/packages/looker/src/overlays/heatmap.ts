/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { get32BitColor, getColor, getRGBA, getRGBAColor } from "../color";
import { BASE_ALPHA } from "../constants";
import { ARRAY_TYPES, NumpyResult, TypedArray } from "../numpy";
import { BaseState, Coordinates, RGB } from "../state";
import {
  BaseLabel,
  CONTAINS,
  LabelUpdate,
  Overlay,
  PointInfo,
  SelectData,
} from "./base";
import { sizeBytes, strokeCanvasRect, t } from "./util";

interface HeatMap {
  data: NumpyResult;
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
  implements Overlay<State> {
  readonly field: string;
  private label: HeatmapLabel;
  private targets?: TypedArray;
  private readonly range: [number, number];
  private cachedColoring: RGB[] | number;
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;
  private awaitingUUID: string;

  constructor(field: string, label: HeatmapLabel) {
    this.field = field;
    this.label = label;
    if (this.label.map) {
      this.targets = new ARRAY_TYPES[this.label.map.data.arrayType](
        this.label.map.data.buffer
      );
      const [height, width] = this.label.map.data.shape;
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
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
    ctx.globalAlpha = tmp * BASE_ALPHA;
    ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);
    ctx.globalAlpha = ctx.globalAlpha;

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
    return state.options.activePaths.includes(this.field);
  }

  getPoints(): Coordinates[] {
    return getHeatmapPoints([]);
  }

  getSizeBytes(): number {
    return sizeBytes(this.label);
  }

  needsLabelUpdate(state: Readonly<State>) {
    const coloring = !state.options.coloring.byLabel
      ? state.options.coloring.seed
      : state.options.coloring.scale || state.options.coloring.seed;

    if (this.cachedColoring === null) {
      this.cachedColoring = coloring;
    }

    return this.targets && this.cachedColoring !== coloring;
  }

  getLabelData(
    state: Readonly<State>,
    messageUUID: string
  ): LabelUpdate<HeatmapLabel>[] {
    this.awaitingUUID = messageUUID;
    this.cachedColoring = !state.options.coloring.byLabel
      ? state.options.coloring.seed
      : state.options.coloring.scale || state.options.coloring.seed;

    return [
      {
        field: this.field,
        label: this.label,
        buffers: [this.label.map.data.buffer, this.label.map.image],
      },
    ];
  }

  updateLabelData(
    [{ label }]: LabelUpdate<HeatmapLabel>[],
    messageUUID: string
  ) {
    if (messageUUID !== this.awaitingUUID) {
      return;
    }
    this.awaitingUUID = null;

    this.label = label;
    const [height, width] = this.label.map.data.shape;
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

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMapCoordinates(state);
    if (sx < 0 || sy < 0) {
      return -1;
    }
    return this.label.map.data.shape[1] * sy + sx;
  }

  private getMapCoordinates({
    pixelCoordinates: [x, y],
    config: {
      dimensions: [mw, mh],
    },
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

    if (state.options.coloring.byLabel) {
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
