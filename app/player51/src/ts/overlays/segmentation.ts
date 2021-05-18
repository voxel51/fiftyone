/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ColorGenerator } from "../color";
import { deserialize, NumpyResult } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { ensureCanvasSize } from "../util";
import { BaseLabel, CONTAINS, isShown, Overlay } from "./base";

interface SegmentationLabel extends BaseLabel {
  mask: string;
}

export default class SegmentationOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  private readonly field: string;
  private readonly label: SegmentationLabel;
  private readonly mask: NumpyResult;
  private generator: ColorGenerator;
  private imageColors: Uint32Array;
  private targets: Uint32Array;
  private rendered: boolean = false;

  constructor(field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    this.mask = deserialize(this.label.mask);
    this.imageColors = new Uint32Array(this.mask.data);
    this.targets = new Uint32Array(this.mask.data);
  }

  containsPoint(context, state, [x, y]) {
    if (this.getTarget([x, y])) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(context, state) {
    ensureCanvasSize(this.intermediateCanvas, this.mask.shape);
    const maskContext = this.intermediateCanvas.getContext("2d");
    const maskImage = maskContext.createImageData(...this.mask.shape);
    const imageColors = new Uint32Array(maskImage.data.buffer);
    const canvasShape = [context.canvas.width, context.canvas.height];
    if (this.rendered && this.generator === state.options.colorGenerator) {
      imageColors.set(this.imageColors);
    } else {
      this.generator = state.options.colorGenerator;
      const maskColors = this.isSelected(state)
        ? this.generator.rawMaskColorsSelected
        : this.generator.rawMaskColors;

      for (let i = 0; i < this.mask.data.length; i++) {
        if (this.mask.data[i]) {
          imageColors[i] = maskColors[this.mask.data[i]];
        }
      }

      this.imageColors = imageColors;
      this.rendered = true;
    }
    maskContext.putImageData(maskImage, 0, 0);
    context.imageSmoothingEnabled = state.options.smoothMasks;
    context.drawImage(
      this.intermediateCanvas,
      ...[0, 0, ...this.mask.shape, 0, 0, canvasShape]
    );
  }

  getMouseDistance(context, state, [x, y]) {
    if (this.containsPoint(state, context, [x, y])) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(context, state, [x, y]) {
    const target = this.getTarget([x, y]);
    return {
      color: this.getRGBAColor(state, target),
      field: this.field,
      label: this.label,
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

  private getIndex(context: CanvasRenderingContext2D, [x, y]) {
    const [sx, sy] = this.getMaskCoordinates(context, [x, y]);
    return this.mask.shape[1] * sy + sx;
  }

  private getMaskCoordinates(
    context: CanvasRenderingContext2D,
    [x, y]: Coordinates
  ) {
    const [h, w] = this.mask.shape;
    const sx = Math.floor(x * (w / context.canvas.width));
    const sy = Math.floor(y * (h / context.canvas.height));
    return [sx, sy];
  }

  private getRGBAColor(state: Readonly<State>, target: number) {
    const rawColor = state.options.colorGenerator.rawMaskColors[target];
    const [r, g, b, a] = new Uint8Array(new Uint32Array([rawColor]).buffer);
    return `rgba(${r},${g},${b},${a / 255})`;
  }

  private getTarget([x, y]: Coordinates) {
    const index = this.getIndex(x, y);
    return this.targets[index];
  }
}
