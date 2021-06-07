/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { getSegmentationColorArray } from "../color";
import { deserialize, NumpyResult } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { ensureCanvasSize } from "../util";
import { BaseLabel, CONTAINS, Overlay } from "./base";
import { t } from "./util";

interface SegmentationLabel extends BaseLabel {
  mask: string;
}

export default class SegmentationOverlay<State extends BaseState>
  implements Overlay<State> {
  private static readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  readonly field: string;
  private readonly label: SegmentationLabel;
  private readonly mask: NumpyResult;
  private imageData: Uint32Array;
  private targets: Uint32Array;
  private imageColors: Uint32Array;
  private colorMap: (key: string | number) => string;

  constructor(state: Readonly<State>, field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    if (this.label.mask) {
      this.mask = deserialize(this.label.mask);
      this.imageColors = new Uint32Array(this.mask.data);
      this.targets = new Uint32Array(this.mask.data);
    }
  }

  containsPoint(state) {
    if (this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    const [maskHeight, maskWidth] = this.mask.shape;

    const maskContext = SegmentationOverlay.intermediateCanvas.getContext("2d");
    ensureCanvasSize(SegmentationOverlay.intermediateCanvas, [
      maskWidth,
      maskHeight,
    ]);
    const maskImage = maskContext.createImageData(maskWidth, maskHeight);
    const maskImageRaw = new Uint32Array(maskImage.data.buffer);
    const imageColors = new Uint32Array(maskImage.data.buffer);

    if (this.colorMap === state.options.colorMap) {
      imageColors.set(this.imageColors);
    } else {
      this.colorMap = state.options.colorMap;
      const colors = getSegmentationColorArray(
        this.colorMap,
        this.isSelected(state)
      );

      for (let i = 0; i < this.mask.data.length; i++) {
        if (this.mask.data[i]) {
          maskImageRaw[i] = colors[this.mask.data[i]];
        }
      }
      this.imageColors = imageColors;
    }

    maskContext.putImageData(maskImage, 0, 0);
    const [tlx, tly] = t(state, 0, 0);
    const [brx, bry] = t(state, 1, 1);
    ctx.drawImage(maskContext.canvas, tlx, tly, brx - tlx, bry - tly);
  }

  getMouseDistance(state) {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state) {
    const target = this.getTarget(state);
    return {
      color: this.getColor(state, target),
      label: {
        _id: this.label._id,
        _cls: this.label._cls,
      },
      field: this.field,
      target,
      type: "Segmentation",
    };
  }

  getSelectData() {
    return {
      id: this.label._id,
      field: this.field,
    };
  }

  isSelected(state: Readonly<State>): boolean {
    return state.options.selectedLabels.includes(this.label._id);
  }

  isShown(state: Readonly<State>): boolean {
    return state.options.activeLabels.includes(this.field);
  }

  getPoints() {
    return getSegmentationPoints([]);
  }

  private getIndex(state: Readonly<State>) {
    const [sx, sy] = this.getMaskCoordinates(state);
    return this.mask.shape[1] * sy + sx;
  }

  private getMaskCoordinates({
    pixelCoordinates: [x, y],
    config: {
      dimensions: [mw, mh],
    },
  }: Readonly<State>) {
    const [h, w] = this.mask.shape;
    const sx = Math.floor(x * (w / mw));
    const sy = Math.floor(y * (h / mh));
    return [sx, sy];
  }

  private getColor(state: Readonly<State>, target: number) {
    return state.options.colorMap(target);
  }

  private getTarget(state: Readonly<State>) {
    const index = this.getIndex(state);
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
