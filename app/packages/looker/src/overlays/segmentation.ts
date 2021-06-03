/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Image } from "@svgdotjs/svg.js";
import { ColorGenerator } from "../color";
import { deserialize, NumpyResult } from "../numpy";
import { BaseState, Coordinates } from "../state";
import { ensureCanvasSize } from "../util";
import { BaseLabel, CONTAINS, Overlay } from "./base";

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
  private generator: ColorGenerator;
  private targets: Uint32Array;
  private image: Image;

  constructor(state: Readonly<State>, field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    if (this.label.mask) {
      this.mask = deserialize(this.label.mask);
      this.targets = new Uint32Array(this.mask.data);
      this.image = this.createMask(state);
    }
  }

  containsPoint(state, [x, y]) {
    if (this.getTarget(state, [x, y])) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(g, state) {
    if (this.image) {
      g.add(this.image);
    }
  }

  getMouseDistance(state, [x, y]) {
    if (this.containsPoint(state, [x, y])) {
      return 0;
    }
    return Infinity;
  }

  getPointInfo(state, [x, y]) {
    const target = this.getTarget(state, [x, y]);
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

  getPoints() {
    return getSegmentationPoints([]);
  }

  private getIndex(state: Readonly<State>, [x, y]) {
    const [sx, sy] = this.getMaskCoordinates(state, [x, y]);
    return this.mask.shape[1] * sy + sx;
  }

  private getMaskCoordinates(state: Readonly<State>, [x, y]: Coordinates) {
    const [h, w] = this.mask.shape;
    const [iw, ih] = state.config.dimensions;
    const sx = Math.floor(x * (w / iw));
    const sy = Math.floor(y * (h / ih));
    return [sx, sy];
  }

  private getRGBAColor(state: Readonly<State>, target: number) {
    const rawColor = state.options.colorGenerator.rawMaskColors[target];
    const [r, g, b, a] = new Uint8Array(new Uint32Array([rawColor]).buffer);
    return `rgba(${r},${g},${b},${a / 255})`;
  }

  private getTarget(state: Readonly<State>, [x, y]: Coordinates) {
    const index = this.getIndex(state, [x, y]);
    return this.targets[index];
  }

  private createMask(state: Readonly<State>): Image {
    const [maskHeight, maskWidth] = this.mask.shape;
    const [w, h] = state.config.dimensions;
    const maskContext = SegmentationOverlay.intermediateCanvas.getContext("2d");
    ensureCanvasSize(SegmentationOverlay.intermediateCanvas, [
      maskWidth,
      maskHeight,
    ]);
    const maskImage = maskContext.createImageData(maskWidth, maskHeight);
    const maskImageRaw = new Uint32Array(maskImage.data.buffer);
    this.generator = state.options.colorGenerator;
    const maskColors = this.isSelected(state)
      ? this.generator.rawMaskColorsSelected
      : this.generator.rawMaskColors;

    for (let i = 0; i < this.mask.data.length; i++) {
      if (this.mask.data[i]) {
        maskImageRaw[i] = maskColors[this.mask.data[i]];
      }
    }
    maskContext.putImageData(maskImage, 0, 0);

    return new Image()
      .attr({
        preserveAspectRatio: "none",
        href: maskContext.canvas.toDataURL("image/png", 1),
      })
      .size(w, h);
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
