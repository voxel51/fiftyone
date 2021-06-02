/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { G, Rect, SVG, Svg, Text } from "@svgdotjs/svg.js";

import { ColorGenerator } from "../color";
import {
  DASH_COLOR,
  DASH_LENGTH,
  LINE_WIDTH,
  MASK_ALPHA,
  STROKE_WIDTH,
} from "../constants";
import { deserialize, NumpyResult } from "../numpy";
import { BaseState, BoundingBox, Coordinates, Dimensions } from "../state";
import {
  distanceFromLineSegment,
  elementBBox,
  ensureCanvasSize,
  getFitRect,
  inRect,
} from "../util";
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

const getHeaderHeight = (canvasHeight: number, fitHeight: number): number => {
  return Math.max(16, (16 / fitHeight) * canvasHeight);
};

const getLabelHeight = (canvasHeight: number, fitHeight: number): number => {
  return Math.max(16, (16 / fitHeight) * canvasHeight);
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
    const [_, __, fh] = getFitRect(
      state.config.dimensions,
      elementBBox(context.canvas)
    );
    if (this.inHeader(context, state, [x, y], fh)) {
      return CONTAINS.BORDER;
    }

    if (this.getMouseDistance(context, state, [x, y]) <= 0) {
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

  draw(context: CanvasRenderingContext2D, state) {
    const color = this.getColor(state);
    context.strokeStyle = color;
    context.fillStyle = color;
    const [_, __, fw, fh] = getFitRect(
      state.config.dimensions,
      elementBBox(context.canvas)
    );
    context.lineWidth = Math.max(
      LINE_WIDTH,
      (LINE_WIDTH / fw / (state.config.thumbnail ? 2 : 1)) *
        context.canvas.width
    );
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
      const headerHeight = getHeaderHeight(ch, fh);
      const labelHeight = getLabelHeight(ch, fh);
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

      context.font = `${getLabelHeight(ch, fh)}px Arial, sans-serif`;
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
    const [_, __, fh] = getFitRect(
      state.config.dimensions,
      elementBBox(context.canvas)
    );
    if (this.inHeader(context, state, [x, y], fh)) {
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

  getPoints() {
    return getDetectionPoints([this.label]);
  }

  private inHeader(
    context: CanvasRenderingContext2D,
    state: Readonly<State>,
    [x, y]: Coordinates,
    fitHeight: number
  ) {
    const bbox = getCanvasBBox(this.label.bounding_box, [
      context.canvas.width,
      context.canvas.height,
    ]);
    const headerHeight = getHeaderHeight(context.canvas.height, fitHeight);
    const pad = getPad(
      headerHeight,
      getLabelHeight(context.canvas.height, fitHeight)
    );
    const headerWidth = getHeaderWidth(
      context,
      this.getLabelText(state),
      this.getIndexText(),
      pad,
      bbox[3]
    );
    return inRect(x, y, [
      bbox[0] - LINE_WIDTH,
      bbox[1] - headerHeight - LINE_WIDTH,
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

export const getDetectionPoints = (labels: DetectionLabel[]): Coordinates[] => {
  let points: Coordinates[] = [];
  labels.forEach((label) => {
    const [tlx, tly, w, h] = label.bounding_box;
    points = [
      ...points,
      [tlx, tly],
      [tlx + w, tly],
      [tlx + w, tly + h],
      [tlx, tly + h],
    ];
  });
  return points;
};

export class DetectionSvgOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel, Svg> {
  readonly svg: boolean = true;
  private rect: Rect;
  private titleRect: Rect;
  private static readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  private readonly mask: NumpyResult;

  constructor(field, label) {
    super(field, label);
    if (typeof label.mask === "string") {
      this.mask = deserialize(label.mask);
    }
  }

  containsPoint(context, state, [x, y]) {
    if (this.rect.inside(x, y)) {
      return CONTAINS.CONTENT;
    }
    if (this.titleRect.inside(x, y)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(svg: G, state) {
    const color = this.getColor(state);
    const {
      config: {
        dimensions: [width, height],
      },
    } = state;
    const {
      bounding_box: [btlx, btly, bw, bh],
    } = this.label;

    const strokeWidth = STROKE_WIDTH / state.scale;

    if (this.mask) {
      const [maskHeight, maskWidth] = this.mask.shape;
      const maskContext = DetectionSvgOverlay.intermediateCanvas.getContext(
        "2d"
      );
      ensureCanvasSize(DetectionSvgOverlay.intermediateCanvas, [
        maskWidth,
        maskHeight,
      ]);
      const maskImage = maskContext.createImageData(maskWidth, maskHeight);
      const maskImageRaw = new Uint32Array(maskImage.data.buffer);

      const bitColor = state.options.colorGenerator.get32BitColor(color);
      for (let i = 0; i < this.mask.data.length; i++) {
        if (this.mask.data[i]) {
          maskImageRaw[i] = bitColor;
        }
      }
      maskContext.putImageData(maskImage, 0, 0);
      svg
        .image(maskContext.canvas.toDataURL("image/png", 1))
        .attr({
          "image-rendering": "pixelated",
          preserveAspectRatio: "none",
        })
        .size(width * bw, height * bh)
        .move(btlx * width, btly * height);
    }
    this.rect = svg
      .rect(width * bw, height * bh)
      .attr({
        fill: "#000000",
        "fill-opacity": 0,
        stroke: color,
        "stroke-width": strokeWidth,
        "stroke-opacity": 1,
      })
      .move(btlx * width, btly * height);

    if (!state.config.thumbnail) {
      // fill and stroke to account for line thickness variation

      const titleText = new Text()
        .text(this.getLabelText(state))
        .fill("#FFFFFF")
        .font({
          family: "Palanquin",
          size: Math.max(8 / state.scale, 2),
          anchor: "middle",
          weight: "bold",
        })
        .attr({ "line-height": Math.max(14 / state.scale, 4) * 1.5 })
        .move(btlx * width + strokeWidth * 2, btly * height);
      const titleBox = titleText.bbox();
      const titleRect = new Rect()
        .size(titleBox.width + strokeWidth * 3, titleBox.height)
        .move(btlx * width + strokeWidth / 2, btly * height + strokeWidth / 2)
        .fill("rgba(0, 0, 0, 0.7)");

      this.titleRect = titleRect;
      svg.add(titleRect);
      svg.add(titleText);
    }
  }

  getMouseDistance(
    _,
    {
      config: {
        dimensions: [w, h],
      },
    },
    [x, y]
  ) {
    const [bx, by, bw, bh] = this.label.bounding_box;
    x /= w;
    y /= h;

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

  getPoints() {
    return getDetectionPoints([this.label]);
  }

  private getLabelText(state: Readonly<State>): string {
    let text =
      this.label.label && state.options.showLabel ? `${this.label.label} ` : "";

    if (state.options.showConfidence && !isNaN(this.label.confidence)) {
      text += `(${Number(this.label.confidence).toFixed(2)})`;
    }
    return text;
  }
}
