/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import {
  checkFontHeight,
  compareData,
  computeBBoxForTextOverlay,
  distance,
  distanceFromLineSegment,
  inRect,
} from "./util.js";
import { deserialize } from "./numpy.js";

export { colorGenerator, ColorGenerator, ClassificationsOverlay, FROM_FO };

const MASK_ALPHA = 0.6;
const LINE_WIDTH = 6;
const POINT_RADIUS = 6;
const DASH_LENGTH = 10;
const DASH_COLOR = "#ffffff";
const _rawColorCache = {};

class ColorGenerator {
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

/**
 * Checks whether an overlay be shown.
 */
function _isOverlayShown(filter: any, field: string, label: object): boolean {
  return filter && filter[field] && filter[field].call
    ? filter[field](label)
    : true;
}

/**
 * A generic interface for how to render label overlays
 *
 * Each sub-class must overload the setup and the draw functions.
 *
 * @param {Renderer} renderer Associated renderer
 */
function Overlay(refs) {
  this.refs = refs;
}
Overlay.prototype.draw = function (context, canvasWidth, canvasHeight) {
  /* eslint-disable-next-line no-console */
  console.log("ERROR: draw called on abstract type");
};
Overlay.prototype.setup = function (context, canvasWidth, canvasHeight) {
  /* eslint-disable-next-line no-console */
  console.log("ERROR: setup called on abstract type");
};

Overlay.prototype._isShown = function () {
  if (
    this.refs.state.options.activeLabels &&
    !this.refs.state.options.activeLabels.includes(this.field)
  ) {
    return false;
  }
  if (
    !_isOverlayShown(this.refs.state.options.filter, this.field, this.label)
  ) {
    return false;
  }
  return true;
};
Overlay.prototype._getColor = function (field, { index, label }) {
  const options = this.refs.state.options;
  const key = options.colorByLabel ? label : field;
  const hasColor = options.colorMap && options.colorMap[key];
  if (hasColor) {
    return options.colorMap[key];
  } else {
    return this.refs.state.options.colorGenerator.color(label);
  }
  // @todo: resurrect me
  return this.refs.state.options.colorGenerator.color(index);
};

Overlay.prototype.hasFocus = function () {
  return this.refs.focusedOverlay === this;
};

// in numerical order (CONTAINS_BORDER takes precedence over CONTAINS_CONTENT)
Overlay.CONTAINS_NONE = 0;
Overlay.CONTAINS_CONTENT = 1;
Overlay.CONTAINS_BORDER = 2;

/**
 * Checks whether the given point (in canvas coordinates) is contained by the
 * overlay, and if so, what part of the overlay contains it.
 *
 * @param {number} x canvas x coordinate
 * @param {number} y canvas y coordinate
 * @return {number} an Overlay.CONTAINS_* constant
 */
Overlay.prototype.containsPoint = function (x, y) {
  return Overlay.CONTAINS_NONE;
};

Overlay.prototype.getMouseDistance = function (x, y) {
  throw new Error("Method getMouseDistance() must be implemented.");
};

Overlay.prototype.getPointInfo = function (x, y) {
  throw new Error("Method getPointInfo() must be implemented.");
};

Overlay.prototype.isSelectable = function (x, y) {
  return this.containsPoint(x, y) && this.getSelectData(x, y);
};

Overlay.prototype.isSelected = function () {
  return this.refs.state.options.selectedLabels.includes(this.label._id);
};

Overlay.prototype.getSelectData = function (x, y) {
  return {
    id: this.label._id,
    field: this.field,
    frameNumber: this.label.frame_number,
  };
};

/**
 * An overlay that renders serialized fo Classifications
 *
 * @param {array} labels [string, Array<[number|null, object]>] (field, (frameNumber, labels)) tuples
 * @param {Renderer} renderer the associated renderer
 *
 */
function ClassificationsOverlay(labels, refs) {
  Overlay.call(this, refs);

  this.name = null;
  this.labels = labels;
  this.textLines = [];

  this.fontHeight = null;
  this.maxTextWidth = -1;
  this.font = null;

  // Location and Size to draw these
  this.x = null;
  this.y = null;
  this.w = null;
  this.h = null;
  this.textPadder = null;
}
ClassificationsOverlay.prototype = Object.create(Overlay.prototype);
ClassificationsOverlay.prototype.constructor = ClassificationsOverlay;

/**
 * Second half of constructor that should be called after the ClassificationsOverlay exists.
 *
 * @method setup
 * @constructor
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
ClassificationsOverlay.prototype.setup = function (
  context,
  canvasWidth,
  canvasHeight
) {
  if (typeof this.labels !== undefined) {
    this._updateTextLines();
  }
  this.textPadder = (3 / this.refs.height) * canvasHeight;
  if (this.x === null || this.y === null) {
    this.x = this.textPadder;
    this.y = this.textPadder;
  }

  this.fontHeight = Math.min(20, 0.09 * canvasHeight);
  this.fontHeight = this.renderer.checkFontHeight(this.fontHeight);
  this.font = `${this.fontHeight}px Arial, sans-serif`;
  if (typeof context === "undefined") {
    return;
  }
  context.font = this.font;
};

ClassificationsOverlay.prototype._isShown = function () {
  return this._getFilteredClassifications().length > 0;
};

ClassificationsOverlay.prototype.getSelectData = function (x, y) {
  const { id, field, frameNumber } = this.getPointInfo(x, y)[0];
  return { id, field, frameNumber };
};

ClassificationsOverlay.prototype._getFilteredClassifications = function () {
  return this.labels.map(([field, labels]) => [
    field,
    labels.filter(([_, label]) =>
      _isOverlayShown(this.refs.state.options.filter, field, label)
    ),
  ]);
};

ClassificationsOverlay.prototype._updateClassifications = function () {
  this.textLines = [];
  const strLimit = 24;
  this._getFilteredClassifications().forEach(([field, labels]) => {
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
};

/**
 * Basic rendering function for drawing the classification overlay instance.
 *
 * @method draw
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
ClassificationsOverlay.prototype.draw = function (
  context,
  canvasWidth,
  canvasHeight
) {
  if (typeof context === "undefined") {
    return;
  }
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

  const labels = this._getFilteredAndFlatLabels();

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
};

ClassificationsOverlay.prototype._getFilteredAndFlatClassifications = function () {
  return this._getFilteredClassifications()
    .map(([field, labels]) =>
      labels.map(([frameNumber, label]) => ({ frameNumber, field, label }))
    )
    .flat();
};

ClassificationsOverlay.prototype.getMouseDistance = function (x, y) {
  if (this.containsPoint(x, y)) {
    return 0;
  }
  return Infinity;
};

ClassificationsOverlay.prototype.getYIntervals = function () {
  return this._getFilteredAndFlatClassifications().map((_, i) => ({
    y: this.y + i * (this.labelHeight + this.textPadder),
    height: this.attrHeight,
  }));
};

ClassificationsOverlay.prototype.containsPoint = function (x, y) {
  const xAxis = x > this.x && x < this.w + this.x;
  return (
    xAxis &&
    this.getYIntervals().some(
      ({ y: top, height }) => y > top && y < top + height
    )
  );
};

ClassificationsOverlay.prototype.getPointInfo = function (x, y) {
  const yIntervals = this.getYIntervals();
  const {
    frameNumber,
    field,
    label,
  } = this._getFilteredAndFlatClassifications().filter((_, i) => {
    const { y: top, height } = yIntervals[i];
    return y > top && y < top + height;
  })[0];

  return [
    {
      color: this._getColor(field, label),
      field,
      frameNumber,
      label,
      type: "Classification",
    },
  ];
};

/**
 * An overlay that renders a fo Segmentation
 *
 * @param {string} field the field name
 * @param {object} label a serialized fo Segmentation label
 * @param {Renderer} renderer the associated renderer
 * @param {number} frameNumber an optional frame number, only applicable to video
 */
function SegmentationOverlay(field, label, refs, frameNumber = null) {
  if (!SegmentationOverlay._tempMaskCanvas) {
    SegmentationOverlay._tempMaskCanvas = document.createElement("canvas");
  }

  Overlay.call(this, refs);

  this.field = field;
  this.label = label;
  this.frameNumber = frameNumber;

  this.x = null;
  this.y = null;
  this.w = null;
  this.h = null;
  this._selectedCache = null;
}
SegmentationOverlay._tempMaskCanvas = null;
SegmentationOverlay.prototype = Object.create(Overlay.prototype);
SegmentationOverlay.prototype.constructor = SegmentationOverlay;

/**
 * Second half of constructor that should be called after the segmentation overlay exists.
 *
 * @method setup
 * @constructor
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
SegmentationOverlay.prototype.setup = function (
  context,
  canvasWidth,
  canvasHeight
) {
  this.x = 0;
  this.y = 0;
  this.w = canvasWidth;
  this.h = canvasHeight;
  this.mask = deserialize(this.label.mask);
  this.imageColors = new Uint32Array(this.mask.data);
  this.targets = new Uint32Array(this.mask.data);
};

/**
 * Basic rendering function for drawing the segmentation overlay instance.
 *
 * @method draw
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
SegmentationOverlay.prototype.draw = function (
  context,
  canvasWidth,
  canvasHeight
) {
  if (this.field && !this._isShown()) {
    return;
  }

  const [maskHeight, maskWidth] = this.mask.shape;
  ensureCanvasSize(SegmentationOverlay._tempMaskCanvas, {
    width: maskWidth,
    height: maskHeight,
  });
  const maskContext = SegmentationOverlay._tempMaskCanvas.getContext("2d");
  const maskImage = maskContext.createImageData(maskWidth, maskHeight);
  const imageColors = new Uint32Array(maskImage.data.buffer);
  if (
    this.mask.rendered &&
    this._generator === this.refs.state.options.colorGenerator
  ) {
    imageColors.set(this.imageColors);
  } else {
    this._generator = this.refs.state.options.colorGenerator;
    const maskColors = this.isSelected()
      ? this._generator.rawMaskColorsSelected
      : this._generator.rawMaskColors;
    const index = this.renderer.frameMaskIndex;
    if (index) {
      for (let i = 0; i < this.mask.data.length; i++) {
        if (index[this.mask.data[i]]) {
          imageColors[i] = maskColors[this.mask.data[i]];
        }
      }
    } else {
      for (let i = 0; i < this.mask.data.length; i++) {
        if (this.mask.data[i]) {
          imageColors[i] = maskColors[this.mask.data[i]];
        }
      }
    }
    this.imageColors = imageColors;
    this.mask.rendered = true;
  }
  maskContext.putImageData(maskImage, 0, 0);
  context.imageSmoothingEnabled = this.renderer.overlayOptions.smoothMasks;
  context.drawImage(
    SegmentationOverlay._tempMaskCanvas,
    0,
    0,
    maskWidth,
    maskHeight,
    0,
    0,
    canvasWidth,
    canvasHeight
  );
  this.h = canvasHeight;
  this.w = canvasWidth;
};

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

/**
 * An overlay that renders a fo Keypoint
 *
 * @param {string} field the field name
 * @param {array} label a serialized fo Keypoint
 * @param {Renderer} renderer the associated renderer
 * @param {number} frameNumber an optional frame number, only applicable to video
 */
function KeypointOverlay(field, label, renderer, frameNumber = null) {
  Overlay.call(this, renderer);

  this.field = field;
  this.label = label;
  this.frameNumber = frameNumber;
}
KeypointOverlay.prototype = Object.create(Overlay.prototype);
KeypointOverlay.prototype.constructor = KeypointOverlay;

/**
 * Second half of constructor that should be called after the keypoint overlay exists.
 *
 * @method setup
 * @constructor
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
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

/**
 * Basic rendering function for drawing the overlay instance.
 *
 * @method draw
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
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

/**
 * An overlay that renders a fo Polyline
 *
 * @param {string} field the field name
 * @param {array} label a serialized fo Polyline
 * @param {Renderer} renderer the associated renderer
 * @param {number} frameNumber an optional frame number, only applicable to video
 */
function PolylineOverlay(field, label, renderer, frameNumber = null) {
  Overlay.call(this, renderer);

  this.field = field;
  this.label = label;
  this.frameNumber = frameNumber;
}
PolylineOverlay.prototype = Object.create(Overlay.prototype);
PolylineOverlay.prototype.constructor = PolylineOverlay;

/**
 * Second half of constructor that should be called after the polyline overlay exists.
 *
 * @method setup
 * @constructor
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
PolylineOverlay.prototype.setup = function (
  context,
  canvasWidth,
  canvasHeight
) {
  this.x = 0;
  this.y = 0;
  this.w = canvasWidth;
  this.h = canvasHeight;

  this._context = context;

  this.path = new Path2D();
  for (const shape of this.label.points) {
    const shapePath = new Path2D();
    for (const [pidx, point] of Object.entries(shape)) {
      if (Number(pidx) > 0) {
        shapePath.lineTo(canvasWidth * point[0], canvasHeight * point[1]);
      } else {
        shapePath.moveTo(canvasWidth * point[0], canvasHeight * point[1]);
      }
    }
    if (this.label.closed) {
      shapePath.closePath();
    }
    this.path.addPath(shapePath);
  }
};

/**
 * Basic rendering function for drawing the overlay instance.
 *
 * @method draw
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
PolylineOverlay.prototype.draw = function (context, canvasWidth, canvasHeight) {
  if (!this._isShown()) {
    return;
  }
  const color = this._getColor(this.name, this.label);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = LINE_WIDTH;
  context.stroke(this.path);
  if (this.isSelected()) {
    context.strokeStyle = DASH_COLOR;
    context.setLineDash([DASH_LENGTH]);
    context.stroke(this.path);
    context.strokeStyle = color;
    context.setLineDash([]);
  }
  if (this.filled) {
    context.globalAlpha = MASK_ALPHA;
    context.fill(this.path);
    context.globalAlpha = 1;
  }
};

PolylineOverlay.prototype.getPointInfo = function (x, y) {
  return {
    field: this.field,
    frameNumber: this.frameNumber,
    label: this.label,
    type: "Polyline",
  };
};

PolylineOverlay.prototype.getMouseDistance = function (x, y) {
  const distances = [];
  for (const shape of this.label.points) {
    for (let i = 0; i < shape.length - 1; i++) {
      distances.push(
        distanceFromLineSegment(
          x,
          y,
          this.w * shape[i][0],
          this.h * shape[i][1],
          this.w * shape[i + 1][0],
          this.h * shape[i + 1][1]
        )
      );
    }
    // acheck final line segment if closed
    if (this.label.closed) {
      distances.push(
        distanceFromLineSegment(
          x,
          y,
          this.w * shape[0][0],
          this.h * shape[0][1],
          this.w * shape[shape.length - 1][0],
          this.h * shape[shape.length - 1][1]
        )
      );
    }
  }
  return Math.min(...distances);
};

PolylineOverlay.prototype.containsPoint = function (x, y) {
  if (!this._isShown()) {
    return Overlay.CONTAINS_NONE;
  }
  const tolerance = LINE_WIDTH * 1.5;
  const minDistance = this.getMouseDistance(x, y);
  if (minDistance <= tolerance) {
    return Overlay.CONTAINS_BORDER;
  }

  if (this.label.closed || this.label.filled) {
    return this._context.isPointInPath(this.path, x, y)
      ? Overlay.CONTAINS_CONTENT
      : Overlay.CONTAINS_NONE;
  }
  return Overlay.CONTAINS_NONE;
};

/**
 * An overlay that renders a fo Detection
 *
 * @param {string} field the field name
 * @param {array} label a serialized fo Detection
 * @param {Renderer} renderer the associated renderer
 * @param {number} frameNumber an optional frame number, only applicable to video
 */
function DetectionOverlay(field, label, renderer, frameNumber = null) {
  if (!DetectionOverlay._tempMaskCanvas) {
    DetectionOverlay._tempMaskCanvas = document.createElement("canvas");
  }
  Overlay.call(this, renderer);

  this._cache_options = Object.assign({}, this.options);
  this.label = label;
  this.field = field;
  this.frameNumber = frameNumber;

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
DetectionOverlay.prototype = Object.create(Overlay.prototype);
DetectionOverlay.prototype.constructor = DetectionOverlay;

/**
 * Second half of constructor that should be called after the detection overlay exists.
 *
 * @method setup
 * @constructor
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
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

/**
 * Checks whether the object has attributes
 * @return {boolean}
 */
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

/**
 * Private method to parse the attributes objects provided at creation and set
 * them up as a renderable string for the overlay.
 *
 * @method _parseAttrs
 * @param {attrs} attrs
 */
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

/**
 * Basic rendering function for drawing the detection overlay instance.
 *
 * @method draw
 * @param {context} context
 * @param {int} canvasWidth
 * @param {int} canvasHeight
 */
DetectionOverlay.prototype.draw = function (
  context,
  canvasWidth,
  canvasHeight
) {
  if (typeof context === "undefined") {
    return;
  }

  if (!this._isShown()) {
    return;
  }

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
    if (_rawColorCache[color] === undefined) {
      const rawMaskColorComponents = new Uint8Array(
        context.getImageData(this.x, this.y, 1, 1).data.buffer
      );
      rawMaskColorComponents[3] = 255 * MASK_ALPHA;
      _rawColorCache[color] = new Uint32Array(rawMaskColorComponents.buffer)[0];
    }
    const rawMaskColor = _rawColorCache[color];

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
    return Overlay.CONTAINS_NONE;
  }
  // the header takes up an extra LINE_WIDTH / 2 on each side due to its border
  if (this._inHeader(x, y)) {
    return Overlay.CONTAINS_BORDER;
  }
  // the distance from the box contents to the edge of the line segment is
  // LINE_WIDTH / 2, so this gives a tolerance of an extra LINE_WIDTH on either
  // side of the border
  const tolerance = LINE_WIDTH * 1.5;
  if (this.getMouseDistance(x, y) <= tolerance) {
    return Overlay.CONTAINS_BORDER;
  }
  if (inRect(x, y, this.x, this.y, this.w, this.h)) {
    return Overlay.CONTAINS_CONTENT;
  }

  return Overlay.CONTAINS_NONE;
};

/**
 * Resizes a canvas so it is at least the specified size.
 *
 * @param {Canvas} canvas
 * @param {number} width
 * @param {number} height
 */
function ensureCanvasSize(canvas, { width, height }) {
  if (canvas.width < width) {
    canvas.width = width;
  }
  if (canvas.height < height) {
    canvas.height = height;
  }
}

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
