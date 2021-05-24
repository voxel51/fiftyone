/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ColorGenerator } from "../color";
import { DASH_COLOR, DASH_LENGTH, LINE_WIDTH, MASK_ALPHA } from "../constants";
import { deserialize, NumpyResult } from "../numpy";
import { BaseState, BoundingBox, Coordinates, Dimensions } from "../state";
import { distanceFromLineSegment, ensureCanvasSize, inRect } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

const LABEL_INDEX_PAD = 51;

interface DetectionLabel extends RegularLabel {
  mask?: string;
  bounding_box: BoundingBox;
}

const getCanvasBBox = (
  [tlx, tly, w, h]: BoundingBox,
  [cw, ch]: Dimensions
): BoundingBox => {
  return [tlx * cw, tly * ch, w * cw, h * ch];
};

const getPad = (headerHeight: number, labelHeight: number): number => {
  return (headerHeight - labelHeight) * 0.4;
};

const getHeaderWidth = (
  context: CanvasRenderingContext2D,
  labelText: string,
  indexText: string,
  pad: number,
  boxWidth: number
): number => {
  const labelWidth = context.measureText(labelText).width;
  const indexWidth = context.measureText(`${indexText}`).width;

  if (labelWidth + indexWidth + LABEL_INDEX_PAD + 2 * pad <= boxWidth) {
    return boxWidth;
  }

  return labelWidth + indexWidth + 2 * pad + LABEL_INDEX_PAD;
};

const getHeaderHeight = (canvasHeight: number): number => {
  return Math.min(26, 0.13 * canvasHeight);
};

const getLabelHeight = (canvasHeight: number): number => {
  return Math.min(20, 0.09 * canvasHeight);
};

export default class DetectionOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel> {
  private static readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  private static readonly rawColorCache = {};
  private readonly mask: NumpyResult;

  constructor(field, label) {
    super(field, label);

    if (typeof label.mask === "string") {
      this.mask = deserialize(label.mask);
    }
  }

  containsPoint(context, state, [x, y]) {
    // the header takes up an extra LINE_WIDTH / 2 on each side due to its border
    if (this.inHeader(context, state, [x, y])) {
      return CONTAINS.BORDER;
    }
    // the distance from the box contents to the edge of the line segment is
    // LINE_WIDTH / 2, so this gives a tolerance of an extra LINE_WIDTH on either
    // side of the border
    const tolerance = LINE_WIDTH * 1.5;
    if (this.getMouseDistance(context, state, [x, y]) <= tolerance) {
      return CONTAINS.BORDER;
    }
    if (
      inRect(
        x,
        y,
        getCanvasBBox(this.label.bounding_box, [
          context.canvas.width,
          context.canvas.height,
        ])
      )
    ) {
      return CONTAINS.CONTENT;
    }

    return CONTAINS.NONE;
  }

  draw(context, state) {
    const color = this.getColor(state);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = (LINE_WIDTH / state.config.dimensions[0]) * 1280;
    const [cw, ch] = [context.canvas.width, context.canvas.height];
    const [bx, by, bw, bh] = getCanvasBBox(this.label.bounding_box, [cw, ch]);
    context.strokeRect(bx, by, bw, bh);

    if (this.isSelected(state)) {
      context.strokeStyle = DASH_COLOR;
      context.setLineDash([DASH_LENGTH]);
      context.strokeRect(bx, by, bw, bh);
      context.strokeStyle = color;
      context.setLineDash([]);
    }

    if (this.mask) {
      if (DetectionOverlay.rawColorCache[color] === undefined) {
        const rawMaskColorComponents = new Uint8Array(
          context.getImageData(bx, by, 1, 1).data.buffer
        );
        rawMaskColorComponents[3] = 255 * MASK_ALPHA;
        DetectionOverlay.rawColorCache[color] = new Uint32Array(
          rawMaskColorComponents.buffer
        )[0];
      }
      const rawMaskColor = DetectionOverlay.rawColorCache[color];

      const [maskHeight, maskWidth] = this.mask.shape;
      ensureCanvasSize(DetectionOverlay.intermediateCanvas, [
        maskWidth,
        maskHeight,
      ]);

      const maskContext = DetectionOverlay.intermediateCanvas.getContext("2d");
      const maskImage = maskContext.createImageData(maskWidth, maskHeight);
      const maskImageRaw = new Uint32Array(maskImage.data.buffer);

      for (let i = 0; i < this.mask.data.length; i++) {
        if (this.mask.data[i]) {
          maskImageRaw[i] = rawMaskColor;
        }
      }
      maskContext.putImageData(maskImage, 0, 0);
      context.imageSmoothingEnabled = state.options.smoothMasks;
      context.drawImage(
        DetectionOverlay.intermediateCanvas,
        0,
        0,
        maskWidth,
        maskHeight,
        bx,
        by,
        bw,
        bh
      );
    }

    if (!state.config.thumbnail) {
      // fill and stroke to account for line thickness variation
      const headerHeight = getHeaderHeight(ch);
      const labelHeight = getLabelHeight(ch);
      const pad = getPad(headerHeight, labelHeight);
      const headerWidth = getHeaderWidth(
        context,
        this.getLabelText(state),
        this.getIndexText(),
        pad,
        bw
      );
      context.strokeRect(bx, by - headerHeight, headerWidth, headerHeight);
      context.fillRect(bx, by - headerHeight, headerWidth, headerHeight);

      context.font = `${getLabelHeight(ch)}px Arial, sans-serif`;
      context.fillStyle = ColorGenerator.white;
      context.fillText(this.getLabelText(state), bx + pad, by - pad);

      context.fillText(
        this.getIndexText(),
        bx +
          headerWidth -
          4 * pad -
          context.measureText(this.getIndexText()).width,
        by - pad
      );
    }
  }

  getMouseDistance(context, state, [x, y]) {
    if (this.inHeader(context, state, [x, y])) {
      return 0;
    }
    const [bx, by, bw, bh] = getCanvasBBox(this.label.bounding_box, [
      context.canvas.width,
      context.canvas.height,
    ]);
    const distances = [
      distanceFromLineSegment(x, y, bx, by, bx + bw, by),
      distanceFromLineSegment(x, y, bx, by, bx, by + bh),
      distanceFromLineSegment(x, y, bx + bw, by + bh, bx + bw, by),
      distanceFromLineSegment(x, y, bx + bw, by + bh, bx, by + bh),
    ];
    return Math.min(...distances);
  }

  getPointInfo(context, state) {
    return {
      color: this.getColor(state),
      field: this.field,
      label: this.label,
      type: "Detection",
    };
  }

  private inHeader(
    context: CanvasRenderingContext2D,
    state: Readonly<State>,
    [x, y]: Coordinates
  ) {
    const bbox = getCanvasBBox(this.label.bounding_box, [
      context.canvas.width,
      context.canvas.height,
    ]);
    const headerHeight = getHeaderHeight(context.canvas.height);
    const pad = getPad(headerHeight, getLabelHeight(context.canvas.height));
    const headerWidth = getHeaderWidth(
      context,
      this.getLabelText(state),
      this.getIndexText(),
      pad,
      bbox[3]
    );
    return inRect(x, y, [
      bbox[0] - LINE_WIDTH / 2,
      bbox[1] - headerHeight - LINE_WIDTH / 2,
      headerWidth + LINE_WIDTH,
      headerHeight + LINE_WIDTH,
    ]);
  }

  private getLabelText(state: Readonly<State>): string {
    let text = (this.label.label ? `${this.label.label} ` : "").toUpperCase();

    if (state.options.showConfidence && !isNaN(this.label.confidence)) {
      text += `(${Number(this.label.confidence).toFixed(2)})`;
    }
    return text;
  }

  private getIndexText() {
    return ![null, undefined].includes(this.label.index)
      ? `${this.label.index}`
      : "";
  }
}
