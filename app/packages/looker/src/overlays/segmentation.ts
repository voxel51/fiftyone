/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { getSegmentationColorArray } from "../color";
import { ARRAY_TYPES, NumpyResult, TypedArray } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { BaseLabel, CONTAINS, Overlay, PointInfo, SelectData } from "./base";
import { sizeBytes, strokeCanvasRect, t } from "./util";

interface SegmentationLabel extends BaseLabel {
  mask?: {
    data: NumpyResult;
    image: ArrayBuffer;
  };
}

export default class SegmentationOverlay<State extends BaseState>
  implements Overlay<State> {
  readonly field: string;
  private readonly label: SegmentationLabel;
  private targets?: TypedArray;
  private colorMap?: (key: string | number) => string;
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;

  constructor(field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    if (this.label.mask) {
      this.targets = new ARRAY_TYPES[this.label.mask.arrayType](
        this.label.mask.buffer
      );

      const [height, width] = this.label.mask.shape;
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
    if (this.targets && this.colorMap !== state.options.colorMap) {
      this.colorMap = state.options.colorMap;
      const colors = getSegmentationColorArray(this.colorMap);
      const imageMask = new Uint32Array(this.imageData.data.buffer);

      for (let i = 0; i < this.targets.length; i++) {
        if (this.targets[i]) {
          imageMask[i] = colors[this.targets[i]];
        }
      }

      const maskCtx = this.canvas.getContext("2d");
      maskCtx.imageSmoothingEnabled = false;
      maskCtx.clearRect(
        0,
        0,
        this.label.mask.shape[1],
        this.label.mask.shape[0]
      );
      maskCtx.putImageData(this.imageData, 0, 0);
    }
    const [tlx, tly] = t(state, 0, 0);
    const [brx, bry] = t(state, 1, 1);
    ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);

    if (this.isSelected(state)) {
      strokeCanvasRect(ctx, state, state.options.colorMap(this.field));
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state: Readonly<State>): PointInfo<SegmentationLabel> {
    const target = this.getTarget(state);
    return {
      color: this.getColor(state, target),
      label: {
        ...this.label,
        mask: {
          shape: this.label.mask.shape ? this.label.mask.shape : null,
        },
      },
      field: this.field,
      target,
      type: "Segmentation",
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
    return getSegmentationPoints([]);
  }

  getSizeBytes(): number {
    return sizeBytes(this.label);
  }

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMaskCoordinates(state);
    if (sx < 0 || sy < 0) {
      return -1;
    }
    return this.label.map.shape[1] * sy + sx;
  }

  private getMaskCoordinates({
    pixelCoordinates: [x, y],
    config: {
      dimensions: [mw, mh],
    },
  }: Readonly<State>): Coordinates {
    const [h, w] = this.label.mask.shape;
    const sx = Math.floor(x * (w / mw));
    const sy = Math.floor(y * (h / mh));
    return [sx, sy];
  }

  private getColor(state: Readonly<State>, target: number): string {
    return state.options.colorMap(target);
  }

  private getTarget(state: Readonly<State>): number {
    const index = this.getIndex(state);

    if (index < 0) {
      return null;
    }
    return this.targets[index];
  }
}

export const getSegmentationPoints = (
  labels: SegmentationLabel[]
): Coordinates[] => {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
};
