/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  checkFontHeight,
  compareData,
  computeBBoxForTextOverlay,
  distance,
  distanceFromLineSegment,
  ensureCanvasSize,
  inRect,
} from "./util.js";
import { deserialize, NumpyResult } from "./numpy.js";
import { BaseState, BoundingBox, Coordinates, Dimensions } from "./state.js";

export { colorGenerator, ColorGenerator, ClassificationsOverlay, FROM_FO };

const MASK_ALPHA = 0.6;
const LINE_WIDTH = 6;
const POINT_RADIUS = 6;
const DASH_LENGTH = 10;
const DASH_COLOR = "#ffffff";

class ColorGenerator {
  static white = "#ffffff";

  private static colorS: string = "70%";
  private static colorL: string = "40%";
  private static colorA: string = "0.875";

  private colors = {};
  private colorSet: string[];
  private rawColors: { [key: number]: number } = {};
  private rawMaskColors: Uint32Array;
  private rawMaskColorsSelected: Uint32Array;
  private seed: number;
  private;

  constructor(seed: number = null) {
    this.seed = (seed % 32) / 32;

    const maskOffset = Math.floor(this.seed * 256);
    this.rawMaskColors = new Uint32Array(256);
    this.rawMaskColorsSelected = new Uint32Array(256);
    for (let i = 0; i < this.rawMaskColors.length; i++) {
      this.rawMaskColors[i] = this.rawColor((i + maskOffset) % 256);
      this.rawMaskColorsSelected[i] = this.rawMaskColors[i];
    }
    // reduce alpha of masks
    const rawMaskColorComponents = new Uint8Array(this.rawMaskColors.buffer);
    for (let i = 3; i < rawMaskColorComponents.length; i += 4) {
      rawMaskColorComponents[i] = Math.floor(255 * MASK_ALPHA);
    }
  }

  private generateColorSet(n: number = 36) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    const delta = 360 / n;
    this.colorSet = new Array(n);
    for (let i = 0; i < n; i++) {
      this.colorSet[i] = `hsla(${i * delta}, ${ColorGenerator.colorS}, ${
        ColorGenerator.colorL
      }, ${ColorGenerator.colorA})`;
      context.fillStyle = this.colorSet[i];
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      this.rawColors[i] = new Uint32Array(
        context.getImageData(0, 0, 1, 1).data.buffer
      )[0];
    }
  }

  color(index: number): string {
    if (!(index in this.colors)) {
      if (typeof this.colorSet === "undefined") {
        this.generateColorSet();
      }
      const rawIndex = Math.floor(this.seed * this.colorSet.length);
      this.colors[index] = this.colorSet[rawIndex];
      this.rawColors[index] = this.rawColors[rawIndex];
    }
    return this.colors[index];
  }

  rawColor(index: number): number {
    if (!(index in this.rawColors)) {
      this.color(index);
    }
    return this.rawColors[index];
  }
}

// Instantiate one colorGenerator for global use
const colorGenerator = new ColorGenerator();

interface BaseLabel {
  _id: string;
  frame_number?: number;
  tags: string[];
}

interface RegularLabel extends BaseLabel {
  label?: string;
  confidence?: number;
}

interface SelectData {
  id: string;
  field: string;
  frameNumber?: number;
}

interface Overlay<State extends BaseState> {
  draw(context: CanvasRenderingContext2D, state: State): void;
  isShown(state: Readonly<State>): boolean;
  getColor(state: Readonly<State>): string;
  containsPoint(
    context: CanvasRenderingContext2D,
    coordinates: Coordinates
  ): CONTAINS;
  getMouseDistance(
    context: CanvasRenderingContext2D,
    coordinates: Coordinates
  ): number;
  getPointInfo(coordinates: CanvasRenderingContext2D, Coordinates): any;
  getSelectData(coordinates: Coordinates): SelectData;
}

// in numerical order (CONTAINS_BORDER takes precedence over CONTAINS_CONTENT)
enum CONTAINS {
  NONE = 0,
  CONTENT = 1,
  BORDER = 2,
}

abstract class CoordinateOverlay<
  State extends BaseState,
  Label extends RegularLabel
> implements Overlay<State> {
  protected readonly field: string;
  protected readonly label: Label;

  constructor(context: CanvasRenderingContext2D, field: string, label: Label) {
    this.field = field;
    this.label = label;
  }

  abstract draw(
    context: CanvasRenderingContext2D,
    state: Readonly<State>
  ): void;

  isShown({ options: { activeLabels, filter } }: Readonly<State>): boolean {
    if (activeLabels && activeLabels.includes(this.field)) {
      return false;
    }

    if (filter && filter[this.field].call) {
      return filter[this.field](this.label);
    }

    return true;
  }

  isSelected(state: Readonly<State>) {
    return state.options.selectedLabels.includes(this.label._id);
  }

  getColor({ options }: Readonly<State>): string {
    const key = options.colorByLabel ? this.label.label : this.field;
    return options.colorMap(key);
  }

  abstract containsPoint(
    context: CanvasRenderingContext2D,
    [x, y]: Coordinates
  );

  abstract getMouseDistance(
    context: CanvasRenderingContext2D,
    [x, y]: Coordinates
  );

  abstract getPointInfo(context: CanvasRenderingContext2D, [x, y]: Coordinates);

  getSelectData([x, y]: Coordinates) {
    return {
      id: this.label._id,
      field: this.field,
      frameNumber: this.label.frame_number,
    };
  }
}

class ClassificationsOverlay<State extends BaseState>
  implements Overlay<State> {
  private readonly labels: BaseLabel[];
  private readonly font: string;
  private lines: string[];
  private readonly topLeft: Coordinates = [8, 8];

  constructor(context: CanvasRenderingContext2D, labels: RegularLabel[]) {
    this.labels = labels;
    this.textLines = [];
    this.font = `${this.fontHeight}px Arial, sans-serif`;

    this.fontHeight = null;
    this.maxTextWidth = -1;
    this.font = null;

    // Location and Size to draw these
    this.topLeft = [null, null];
    this.textPadder = null;
  }

  isShown() {
    return this.getFiltered().length > 0;
  }

  private getFiltered() {
    return this.labels.map(([field, labels]) => [
      field,
      labels.filter(([_, label]) =>
        _isOverlayShown(this.refs.state.options.filter, field, label)
      ),
    ]);
  }

  private getFilteredAndFlat() {
    return this._getFiltered()
      .map(([field, labels]) =>
        labels.map(([frameNumber, label]) => ({ frameNumber, field, label }))
      )
      .flat();
  }

  private updateLines() {
    this.textLines = [];
    const strLimit = 24;
    this._getFiltered().forEach(([field, labels]) => {
      const name =
        field.length > strLimit ? field.slice(0, strLimit) + "..." : field;

      this.text = [
        ...this.text,
        ...labels[field].map(([_, { confidence, label }]) => {
          label =
            typeof label === "string" && label.length > strLimit
              ? label.slice(0, strLimit) + "..."
              : label;

          let s = `${name}: ${label}`;
          if (this.refs.state.options.showConfidence && !isNaN(confidence)) {
            s += ` (${Number(confidence).toFixed(2)})`;
          }

          return s;
        }),
      ];
    });
  }

  setup(context) {
    if (typeof this.labels !== undefined) {
      this._updateTextLines();
    }

    this.fontHeight = Math.min(20, 0.09 * canvasHeight);
    this.fontHeight = this.renderer.checkFontHeight(this.fontHeight);

    context.font = this.font;
  }

  getSelectData([x, y]) {
    const { id, field, frameNumber } = this.getPointInfo(x, y)[0];
    return { id, field, frameNumber };
  }

  getMouseDistance([x, y]) {
    if (this.containsPoint([x, y])) {
      return 0;
    }
    return Infinity;
  }
  containsPoint([x, y]) {
    const xAxis = x > this.x && x < this.w + this.x;
    return (
      xAxis &&
      this.getYIntervals().some(
        ({ y: top, height }) => y > top && y < top + height
      )
    );
  }

  getPointInfo() {
    const yIntervals = this.getYIntervals();
    const { frameNumber, field, label } = this.getFilteredAndFlat().filter(
      (_, i) => {
        const { y: top, height } = yIntervals[i];
        return y > top && y < top + height;
      }
    )[0];

    return [
      {
        color: this.getColor(field, label),
        field,
        frameNumber,
        label,
        type: "Classification",
      },
    ];
  }

  private getYIntervals() {
    return this.getFilteredAndFlat().map((_, i) => ({
      y: this.y + i * (this.labelHeight + this.textPadder),
      height: this.attrHeight,
    }));
  }

  draw(context, state) {
    if (this.w === null) {
      this.setup(context, canvasWidth, canvasHeight);
    }

    if (this.refs.state.config.thumbnail) {
      return;
    }

    this._updateTextLines();
    if (!this.textLines.length) {
      return;
    }
    context.font = this.font;

    let y = this.y;
    const bboxes = this.textLines.map((label) =>
      computeBBoxForTextOverlay(
        context,
        [label],
        this.fontHeight,
        this.textPadder
      )
    );
    this.labelHeight = bboxes[0].height;
    this.w = Math.max(...bboxes.map((b) => b.width));

    const labels = this._getFilteredAndFlat();

    for (let l = 0; l < this.text.length; l++) {
      context.fillStyle = this.renderer.metadataOverlayBGColor;
      context.fillRect(this.x, y, this.w, this.labelHeight);

      // Rendering y is at the baseline of the text
      context.fillStyle = colorGenerator.white;
      context.fillText(
        this.text[l],
        this.x + this.textPadder,
        y + this.fontHeight + this.textPadder
      );
      const { field, label } = labels[l];
      if (this.refs.state.options.selectedLabels.includes(label._id)) {
        context.lineWidth = this.textPadder / 2;
        context.strokeRect(this.x, y, this.w, this.labelHeight);
        context.strokeStyle = this._getColor(field, label);
        context.strokeRect(this.x, y, this.w, this.attrHeight);
        context.strokeStyle = DASH_COLOR;
        context.setLineDash([DASH_LENGTH]);
        context.strokeRect(this.x, y, this.w, this.attrHeight);
        context.setLineDash([]);
      }
      y += this.textPadder + this.labelHeight;
    }
  }
}

interface SegmentationLabel extends BaseLabel {
  mask: string;
}

class SegmentationOverlay<State extends BaseState> implements Overlay<State> {
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

  constructor(
    context: CanvasRenderingContext2D,
    field: string,
    label: SegmentationLabel
  ) {
    this.field = field;
    this.label = label;
    this.mask = deserialize(this.label.mask);
    this.imageColors = new Uint32Array(this.mask.data);
    this.targets = new Uint32Array(this.mask.data);
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
      const maskColors = this.isSelected()
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
}

SegmentationOverlay.prototype.getMaskCoordinates = function (x, y) {
  const [h, w] = this.mask.shape;
  const sx = Math.floor(x * (w / this.w));
  const sy = Math.floor(y * (h / this.h));
  return [sx, sy];
};

SegmentationOverlay.prototype.getIndex = function (x, y) {
  const [sx, sy] = this.getMaskCoordinates(x, y);
  return this.mask.shape[1] * sy + sx;
};

SegmentationOverlay.prototype.getTarget = function (x, y) {
  const index = this.getIndex(x, y);
  return this.targets[index];
};

SegmentationOverlay.prototype.getMouseDistance = function (x, y) {
  if (this.containsPoint(x, y)) {
    return 0;
  }
  return Infinity;
};

SegmentationOverlay.prototype.containsPoint = function (x, y) {
  if (!this._isShown()) {
    return Overlay.CONTAINS_NONE;
  }
  if (this.getTarget(x, y)) {
    return Overlay.CONTAINS_CONTENT;
  }
  return Overlay.CONTAINS_NONE;
};

SegmentationOverlay.prototype.getRGBAColor = function (target) {
  const rawColor = this.renderer.options.colorGenerator.rawMaskColors[target];
  const [r, g, b, a] = new Uint8Array(new Uint32Array([rawColor]).buffer);
  return `rgba(${r},${g},${b},${a / 255})`;
};

SegmentationOverlay.prototype.getPointInfo = function (x, y) {
  const target = this.getTarget(x, y);
  return {
    color: this.getRGBAColor(target),
    field: this.field,
    frameNumber: this.frameNumber,
    label: this.label,
    target,
    type: "Segmentation",
  };
};

class KeypointOverlay {
  constructor(context, field, label) {
    s;
  }
}

function KeypointOverlay(field, label, renderer, frameNumber = null) {
  Overlay.call(this, renderer);

  this.field = field;
  this.label = label;
  this.frameNumber = frameNumber;
}

KeypointOverlay.prototype.setup = function (
  context,
  canvasWidth,
  canvasHeight
) {
  this.x = 0;
  this.y = 0;
  this.w = canvasWidth;
  this.h = canvasHeight;
};

KeypointOverlay.prototype.draw = function (context, canvasWidth, canvasHeight) {
  if (!this._isShown()) {
    return;
  }
  const color = this._getColor(this.field, this.label);
  context.lineWidth = 0;
  const isSelected = this.isSelected();

  for (const point of this.label.points) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(
      point[0] * canvasWidth,
      point[1] * canvasHeight,
      isSelected ? POINT_RADIUS * 2 : POINT_RADIUS,
      0,
      Math.PI * 2
    );
    context.fill();

    if (isSelected) {
      context.fillStyle = DASH_COLOR;
      context.beginPath();
      context.arc(
        point[0] * canvasWidth,
        point[1] * canvasHeight,
        POINT_RADIUS,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
};

KeypointOverlay.prototype._getDistanceAndPoint = function (x, y) {
  const distances = [];
  for (const point of this.points) {
    const d = distance(x, y, point[0] * this.w, point[1] * this.h);
    if (d <= POINT_RADIUS) {
      distances.push([0, point]);
    } else {
      distances.push([d, point]);
    }
  }

  return distances.sort((a, b) => a[0] - b[0])[0];
};

KeypointOverlay.prototype.getPointInfo = function (x, y) {
  return {
    color: this._getColor(this.name, this.label),
    field: this.field,
    frameNumber: this.frameNumber,
    label: this.label,
    point: this._getDistanceAndPoint(x, y)[1],
    type: "Keypoint",
  };
};

KeypointOverlay.prototype.getMouseDistance = function (x, y) {
  return this._getDistanceAndPoint(x, y)[0];
};

KeypointOverlay.prototype.containsPoint = function (x, y) {
  if (!this._isShown()) {
    return Overlay.CONTAINS_NONE;
  }
  if (this._getDistanceAndPoint(x, y)[0] <= 2 * POINT_RADIUS) {
    return Overlay.CONTAINS_BORDER;
  }
  return Overlay.CONTAINS_NONE;
};

interface PolylineLabel extends RegularLabel {
  points: Coordinates[][];
  closed: boolean;
  filled: boolean;
}

class PolylineOverlay<State extends BaseState> extends CoordinateOverlay<
  State,
  PolylineLabel
> {
  private readonly path: Path2D;

  constructor(
    context: CanvasRenderingContext2D,
    field: string,
    label: PolylineLabel
  ) {
    super(context, field, label);
    this.path = new Path2D();
    const [width, height] = [context.canvas.width, context.canvas.height];
    for (const shape of this.label.points) {
      const shapePath = new Path2D();
      for (const [pidx, point] of Object.entries(shape)) {
        if (Number(pidx) > 0) {
          shapePath.lineTo(height * point[0], height * point[1]);
        } else {
          shapePath.moveTo(width * point[0], height * point[1]);
        }
      }
      if (this.label.closed) {
        shapePath.closePath();
      }
      this.path.addPath(shapePath);
    }
  }

  containsPoint(context, [x, y]) {
    const tolerance = LINE_WIDTH * 1.5;
    const minDistance = this.getMouseDistance(x, y);
    if (minDistance <= tolerance) {
      return CONTAINS.BORDER;
    }

    if (this.label.closed || this.label.filled) {
      return context.isPointInPath(this.path, x, y)
        ? CONTAINS.CONTENT
        : CONTAINS.NONE;
    }
    return CONTAINS.NONE;
  }

  draw(context, state) {
    const color = this.getColor(state);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = LINE_WIDTH;
    context.stroke(this.path);
    if (this.isSelected(state)) {
      context.strokeStyle = DASH_COLOR;
      context.setLineDash([DASH_LENGTH]);
      context.stroke(this.path);
      context.strokeStyle = color;
      context.setLineDash([]);
    }
    if (this.label.filled) {
      context.globalAlpha = MASK_ALPHA;
      context.fill(this.path);
      context.globalAlpha = 1;
    }
  }

  getMouseDistance(context, [x, y]) {
    const distances = [];
    const [w, h] = [context.canvas.width, context.canvas.height];
    for (const shape of this.label.points) {
      for (let i = 0; i < shape.length - 1; i++) {
        distances.push(
          distanceFromLineSegment(
            x,
            y,
            w * shape[i][0],
            h * shape[i][1],
            w * shape[i + 1][0],
            h * shape[i + 1][1]
          )
        );
      }
      // acheck final line segment if closed
      if (this.label.closed) {
        distances.push(
          distanceFromLineSegment(
            x,
            y,
            w * shape[0][0],
            h * shape[0][1],
            w * shape[shape.length - 1][0],
            h * shape[shape.length - 1][1]
          )
        );
      }
    }
    return Math.min(...distances);
  }

  getPointInfo() {
    return {
      field: this.field,
      label: this.label,
      type: "Polyline",
    };
  }
}

interface DetectionLabel extends RegularLabel {
  mask?: string;
  bounding_box: BoundingBox;
}

class DetectionOverlay<State extends BaseState> extends CoordinateOverlay<
  State
> {
  private readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );

  constructor(context, field, label) {
    super(context, field, label);
  }
}

function DetectionOverlay(field, label, renderer, frameNumber = null) {
  this._setupLabel();
  this.indexStr = "";
  if (this.label.index != null) {
    this.indexStr = `${this.label.index}`;
  }

  if (typeof label.mask === "string") {
    this.mask = deserialize(label.mask);
  }

  this.x = null;
  this.y = null;
  this.w = null;
  this.h = null;

  // this is the height of the header box into which we draw the label
  this.headerHeight = null;
  this.headerWidth = null;
  this.headerFontHeight = null;
  this.textPadder = null;
  this.labelTextWidth = null;
  this.indexTextWidth = null;
  this.labelIndexPadding = 51; // extra space forced between label and index in header

  this.attrText = null;
  this.attrTextWidth = -1;
  this.attrFontHeight = null;
  this.attrWidth = 0;
  this.attrHeight = 0;
}
DetectionOverlay._tempMaskCanvas = null;
DetectionOverlay._rawColorCache = {};
DetectionOverlay.prototype = Object.create(Overlay.prototype);
DetectionOverlay.prototype.constructor = DetectionOverlay;

DetectionOverlay.prototype.setup = function (
  context,
  canvasWidth,
  canvasHeight
) {
  this._parseAttrs();
  const [tlx, tly, w, h] = this.label.bounding_box;
  this.x = tlx * canvasWidth;
  this.y = tly * canvasHeight;
  this.w = w * canvasWidth;
  this.h = h * canvasHeight;
  this.headerFontHeight = Math.min(20, 0.09 * canvasHeight);
  this.headerFontHeight = checkFontHeight(this.headerFontHeight);
  this.attrFontHeight = Math.min(18, 0.088 * canvasHeight);
  this.attrFontHeight = checkFontHeight(this.attrFontHeight);

  this.headerHeight = Math.min(26, 0.13 * canvasHeight);
  // this is *0.4 instead of / 2 because it looks better
  this.textPadder = (this.headerHeight - this.headerFontHeight) * 0.4;

  if (typeof context === "undefined") {
    return;
  }
  this._setupFontWidths(context, canvasWidth, canvasHeight);
};

DetectionOverlay.prototype.hasAttrs = function () {
  // @todo: update
  return this._attrs !== undefined;
};

DetectionOverlay.prototype._setupFontWidths = function (context) {
  context.font = `${this.headerFontHeight}px Arial, sans-serif`;
  this.labelTextWidth = context.measureText(this.labelUpper).width;
  this.indexTextWidth = context.measureText(this.indexStr).width;

  this._setupAttrFont(context);
  this.attrFontWidth = context.measureText(this.attrText).width;

  if (
    this.labelTextWidth +
      this.indexTextWidth +
      this.labelIndexPadding +
      2 * this.textPadder <=
    this.w
  ) {
    this.headerWidth = this.w;
  } else {
    this.headerWidth =
      this.labelTextWidth +
      this.indexTextWidth +
      2 * this.textPadder +
      this.labelIndexPadding;
  }
};

DetectionOverlay.prototype._setupAttrFont = function (context) {
  this.attrFont = `${this.attrFontHeight}px Arial, sans-serif`;
  context.font = this.attrFont;
};

DetectionOverlay.prototype._setupAttrBox = function (context) {
  this._setupAttrFont(context);
  const wh = computeBBoxForTextOverlay(
    context,
    this.attrText,
    this.attrFontHeight,
    this.textPadder
  );
  this.attrWidth = wh.width;
  this.attrHeight = wh.height;
};

DetectionOverlay.prototype._setupLabel = function () {
  this.labelUpper = (this.label.label
    ? `${this.label.label} `
    : ""
  ).toUpperCase();
  if (this.options.showConfidence && !isNaN(this.label.confidence)) {
    this.labelUpper += `(${Number(this.label.confidence).toFixed(2)})`;
  }
};

DetectionOverlay.prototype._parseAttrs = function (attrs) {
  if (this.attrText === null) {
    this.attrText = "";
  }

  if (typeof attrs === "undefined") {
    if (typeof this._attrs === "undefined") {
      return;
    }
    attrs = this._attrs;
  }

  const sortedAttrs = attrs.sort(function (attr1, attr2) {
    return attr1.name.localeCompare(attr2.name);
  });

  if (!this.options.showAttrs) {
    this.attrText = "";
    return;
  }

  if (this.options.attrRenderMode === "attr-value") {
    this.attrText = sortedAttrs
      .map(function (attr) {
        const attrVal = String(attr.value).replace(/_/g, " ");
        const attrName = attr.name.replace(/_/g, " ");
        return `${attrName}: ${attrVal}`;
      })
      .join("\n");
  } else {
    this.attrText = sortedAttrs
      .map(function (attr) {
        return String(attr.value).replace(/_/g, " ");
      })
      .join(", ");
  }
};

DetectionOverlay.prototype.draw = function (
  context,
  canvasWidth,
  canvasHeight
) {
  let optionsUpdated = false;
  if (!compareData(this._cache_options, this.options)) {
    this._cache_options = Object.assign({}, this.options);
    this._parseAttrs(this._attrs);
    this._setupAttrBox(context);
    optionsUpdated = true;
  }

  if (optionsUpdated || this.labelTextWidth === null) {
    this._setupLabel();
    this._setupFontWidths(context, canvasWidth, canvasHeight);
  }
  const color = this._getColor(this.field, this.label);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = LINE_WIDTH;
  context.strokeRect(this.x, this.y, this.w, this.h);

  if (this.isSelected()) {
    context.strokeStyle = DASH_COLOR;
    context.setLineDash([DASH_LENGTH]);
    context.strokeRect(this.x, this.y, this.w, this.h);
    context.strokeStyle = color;
    context.setLineDash([]);
  }

  if (this.mask) {
    if (DetectionOverlay._rawColorCache[color] === undefined) {
      const rawMaskColorComponents = new Uint8Array(
        context.getImageData(this.x, this.y, 1, 1).data.buffer
      );
      rawMaskColorComponents[3] = 255 * MASK_ALPHA;
      DetectionOverlay._rawColorCache[color] = new Uint32Array(
        rawMaskColorComponents.buffer
      )[0];
    }
    const rawMaskColor = DetectionOverlay._rawColorCache[color];

    const [maskHeight, maskWidth] = this.mask.shape;
    ensureCanvasSize(DetectionOverlay._tempMaskCanvas, {
      width: maskWidth,
      height: maskHeight,
    });

    const maskContext = DetectionOverlay._tempMaskCanvas.getContext("2d");
    const maskImage = maskContext.createImageData(maskWidth, maskHeight);
    const maskImageRaw = new Uint32Array(maskImage.data.buffer);

    for (let i = 0; i < this.mask.data.length; i++) {
      if (this.mask.data[i]) {
        maskImageRaw[i] = rawMaskColor;
      }
    }
    maskContext.putImageData(maskImage, 0, 0);
    context.imageSmoothingEnabled = this.renderer.overlayOptions.smoothMasks;
    context.drawImage(
      DetectionOverlay._tempMaskCanvas,
      0,
      0,
      maskWidth,
      maskHeight,
      this.x,
      this.y,
      this.w,
      this.h
    );
  }

  if (!this.renderer.player.options.Tthumbnail) {
    // fill and stroke to account for line thickness variation
    context.strokeRect(
      this.x,
      this.y - this.headerHeight,
      this.headerWidth,
      this.headerHeight
    );
    context.fillRect(
      this.x,
      this.y - this.headerHeight,
      this.headerWidth,
      this.headerHeight
    );

    context.font = `${this.headerFontHeight}px Arial, sans-serif`;
    context.fillStyle = colorGenerator.white;
    context.fillText(
      this.labelUpper,
      this.x + this.textPadder,
      this.y - this.textPadder
    );

    context.fillText(
      this.indexStr,
      this.x + this.headerWidth - 4 * this.textPadder - this.indexTextWidth,
      this.y - this.textPadder
    );

    if (!this.options.attrsOnlyOnClick || this.hasFocus()) {
      this._setupAttrFont(context);
      if (
        typeof this.attrFontWidth === "undefined" ||
        this.attrFontWidth === null
      ) {
        this.attrFontWidth = context.measureText(this.attrText).width;
        this._setupAttrBox(context);
      }
      if (this.options.attrRenderBox) {
        context.fillStyle = this.renderer.metadataOverlayBGColor;
        context.fillRect(
          this.x + this.textPadder,
          this.y + this.textPadder,
          this.attrWidth,
          this.attrHeight
        );
      }
      const lines = this.attrText.split("\n");
      context.fillStyle = colorGenerator.white;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        context.fillText(
          line,
          this.x + this.textPadder,
          this.y +
            3 +
            this.attrFontHeight +
            this.textPadder +
            this.attrFontHeight * i
        );
      }
    }
  }
};

DetectionOverlay.prototype.getPointInfo = function (x, y) {
  return {
    color: this._getColor(this.field, this.label),
    field: this.field,
    frameNumber: this.frameNumber,
    label: this.label,
    type: "Detection",
  };
};

DetectionOverlay.prototype._inHeader = function (x, y) {
  return inRect(
    x,
    y,
    this.x - LINE_WIDTH / 2,
    this.y - this.headerHeight - LINE_WIDTH / 2,
    this.headerWidth + LINE_WIDTH,
    this.headerHeight + LINE_WIDTH
  );
};

DetectionOverlay.prototype.getMouseDistance = function (x, y) {
  if (this._inHeader(x, y)) {
    return 0;
  }
  const distances = [
    distanceFromLineSegment(x, y, this.x, this.y, this.x + this.w, this.y),
    distanceFromLineSegment(x, y, this.x, this.y, this.x, this.y + this.h),
    distanceFromLineSegment(
      x,
      y,
      this.x + this.w,
      this.y + this.h,
      this.x + this.w,
      this.y
    ),
    distanceFromLineSegment(
      x,
      y,
      this.x + this.w,
      this.y + this.h,
      this.x,
      this.y + this.h
    ),
  ];
  return Math.min(...distances);
};

DetectionOverlay.prototype.containsPoint = function (x, y) {
  if (!this._isShown()) {
    return CONTAINS.NONE;
  }
  // the header takes up an extra LINE_WIDTH / 2 on each side due to its border
  if (this._inHeader(x, y)) {
    return CONTAINS.BORDER;
  }
  // the distance from the box contents to the edge of the line segment is
  // LINE_WIDTH / 2, so this gives a tolerance of an extra LINE_WIDTH on either
  // side of the border
  const tolerance = LINE_WIDTH * 1.5;
  if (this.getMouseDistance(x, y) <= tolerance) {
    return CONTAINS.BORDER;
  }
  if (inRect(x, y, this.x, this.y, this.w, this.h)) {
    return CONTAINS.CONTENT;
  }

  return CONTAINS.NONE;
};

const fromLabel = (overlayType) => (
  field,
  label,
  renderer,
  frameNumber = null
) => [new overlayType(field, label, renderer, frameNumber)];

const fromLabelList = (overlayType, list_key) => (
  field,
  labels,
  renderer,
  frameNumber = null
) =>
  labels[list_key].map(
    (label) => new overlayType(field, label, renderer, frameNumber)
  );

const FROM_FO = {
  Detection: fromLabel(DetectionOverlay),
  Detections: fromLabelList(DetectionOverlay, "detections"),
  Keypoint: fromLabel(KeypointOverlay),
  Keypoints: fromLabelList(KeypointOverlay, "keypoints"),
  Polyline: fromLabel(PolylineOverlay),
  PoylinesOverlay: fromLabelList(PolylineOverlay, "polylines"),
  Segmentation: fromLabel(SegmentationOverlay),
};
