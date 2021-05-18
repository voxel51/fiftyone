/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

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
