/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ForeignObject, SVG } from "@svgdotjs/svg.js";
import {
  get32BitColor,
  getAlphaColor,
  getSegmentationColorArray,
} from "../color";
import { MASK_ALPHA, SELECTED_MASK_ALPHA } from "../constants";
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
  private targets: Uint32Array;
  private foreignObject: ForeignObject;
  private canvas: HTMLCanvasElement;
  private colorMap: (key: string | number) => string;

  constructor(state: Readonly<State>, field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    this.colorMap = state.options.colorMap;
    if (this.label.mask) {
      const [w, h] = state.config.dimensions;
      this.mask = deserialize(this.label.mask);
      this.targets = new Uint32Array(this.mask.data);
      this.canvas = document.createElement("canvas");
      this.canvas.getContext("2d").imageSmoothingEnabled = false;
      this.canvas.width = w;
      this.canvas.height = h;
      this.foreignObject = new ForeignObject().size(w, h).add(SVG(this.canvas));
      this.colorMap = state.options.colorMap;
      this.drawMask(state);
    }
  }

  containsPoint(state, [x, y]) {
    if (this.getTarget(state, [x, y])) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(g, state) {
    if (this.mask) {
      if (this.colorMap !== state.options.colorMap) {
        this.colorMap = state.options.colorMap;
        this.drawMask(state);
      }
      g.add(this.foreignObject);
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
      color: this.getColor(state, target),
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

  private getColor(state: Readonly<State>, target: number) {
    return state.options.colorMap(target);
  }

  private getTarget(state: Readonly<State>, [x, y]: Coordinates) {
    const index = this.getIndex(state, [x, y]);
    return this.targets[index];
  }

  private drawMask(state: Readonly<State>) {
    const [maskHeight, maskWidth] = this.mask.shape;
    const [w, h] = state.config.dimensions;
    const maskContext = SegmentationOverlay.intermediateCanvas.getContext("2d");
    ensureCanvasSize(SegmentationOverlay.intermediateCanvas, [
      maskWidth,
      maskHeight,
    ]);
    const maskImage = maskContext.createImageData(maskWidth, maskHeight);
    const maskImageRaw = new Uint32Array(maskImage.data.buffer);

    const colors = getSegmentationColorArray(
      this.colorMap,
      this.isSelected(state)
    );

    for (let i = 0; i < this.mask.data.length; i++) {
      if (this.mask.data[i]) {
        maskImageRaw[i] = colors[this.mask.data[i]];
      }
    }

    maskContext.putImageData(maskImage, 0, 0);
    const context = this.canvas.getContext("2d");
    context.clearRect(0, 0, w, h);
    this.canvas.getContext("2d").drawImage(maskContext.canvas, 0, 0, w, h);
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
