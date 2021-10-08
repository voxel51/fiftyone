/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
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

interface SegmentationLabel extends BaseLabel {
  mask?: {
    data: NumpyResult;
    image: ArrayBuffer;
  };
}

interface SegmentationInfo extends BaseLabel {
  mask?: {
    shape: [number, number];
  };
}

export default class SegmentationOverlay<State extends BaseState>
  implements Overlay<State> {
  readonly field: string;
  private label: SegmentationLabel;
  private targets?: TypedArray;
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;
  private awaitingUUID: string;
  private cachedColoring: RGB[];

  constructor(field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    if (this.label.mask) {
      this.targets = new ARRAY_TYPES[this.label.mask.data.arrayType](
        this.label.mask.data.buffer
      );

      const [height, width] = this.label.mask.data.shape;
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
    if (!this.targets) {
      return;
    }

    const [tlx, tly] = t(state, 0, 0);
    const [brx, bry] = t(state, 1, 1);
    const tmp = ctx.globalAlpha;
    ctx.globalAlpha = tmp * BASE_ALPHA;
    ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);
    ctx.globalAlpha = tmp;

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

  getPointInfo(state: Readonly<State>): PointInfo<SegmentationInfo> {
    const target = this.getTarget(state);
    return {
      color: this.getColor(state, target),
      label: {
        ...this.label,
        mask: {
          shape: this.label.mask.data.shape ? this.label.mask.data.shape : null,
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

  needsLabelUpdate(state: Readonly<State>) {
    if (this.cachedColoring === null) {
      this.cachedColoring = state.options.colorTargets;
    }

    return this.targets && this.cachedColoring !== state.options.colorTargets;
  }

  getLabelData(state: Readonly<State>, messageUUID: string) {
    this.awaitingUUID = messageUUID;
    this.cachedColoring = state.options.colorTargets;

    return [
      {
        label: this.label,
        buffers: [this.label.mask.data.buffer, this.label.mask.image],
        coloring: state.options.colorTargets,
      },
    ];
  }

  updateLabelData(
    [{ label }]: LabelUpdate<SegmentationLabel>[],
    messageUUID: string
  ) {
    if (messageUUID !== this.awaitingUUID) {
      return;
    }
    this.awaitingUUID = null;

    this.label = label;
    const [height, width] = this.label.mask.data.shape;
    this.imageData = new ImageData(
      new Uint8ClampedArray(this.label.mask.image),
      width,
      height
    );
    const maskCtx = this.canvas.getContext("2d");
    maskCtx.imageSmoothingEnabled = false;
    maskCtx.clearRect(
      0,
      0,
      this.label.mask.data.shape[1],
      this.label.mask.data.shape[0]
    );
    maskCtx.putImageData(this.imageData, 0, 0);
  }

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMaskCoordinates(state);
    if (sx < 0 || sy < 0) {
      return -1;
    }
    return this.label.mask.data.shape[1] * sy + sx;
  }

  private getMaskCoordinates({
    pixelCoordinates: [x, y],
    config: {
      dimensions: [mw, mh],
    },
  }: Readonly<State>): Coordinates {
    const [h, w] = this.label.mask.data.shape;
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
