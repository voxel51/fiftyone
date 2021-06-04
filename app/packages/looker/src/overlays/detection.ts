/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { G, Image, Rect, Text } from "@svgdotjs/svg.js";
import { get32BitColor, getAlphaColor } from "../color";
import { MASK_ALPHA, TEXT_BG_COLOR } from "../constants";

import { deserialize, NumpyResult } from "../numpy";
import { BaseState, BoundingBox, Coordinates } from "../state";
import { distanceFromLineSegment, ensureCanvasSize } from "../util";
import { CONTAINS, CoordinateOverlay, RegularLabel } from "./base";

interface DetectionLabel extends RegularLabel {
  mask?: string;
  bounding_box: BoundingBox;
}

export default class DetectionOverlay<
  State extends BaseState
> extends CoordinateOverlay<State, DetectionLabel> {
  readonly g: G;

  private rect: Rect;
  private color: string;
  private labelText: string;
  private titleRect: Rect;
  private hideTitle: boolean;
  private strokeWidth: number;
  private fontSize: number;
  private title: Text;
  private img: Image;
  private static readonly intermediateCanvas: HTMLCanvasElement = document.createElement(
    "canvas"
  );
  private readonly mask: NumpyResult;

  constructor(state, field, label) {
    super(field, label);
    this.color = this.getColor(state);
    this.g = new G();

    if (typeof label.mask === "string") {
      this.mask = deserialize(label.mask);
      this.img = this.createMask(state);
      this.g.add(this.img);
    }

    const {
      config: {
        dimensions: [width, height],
      },
    } = state;
    const {
      bounding_box: [btlx, btly, bw, bh],
    } = this.label;

    this.rect = new Rect()
      .size(width * bw, height * bh)
      .attr({
        fill: "#000000",
        "fill-opacity": 0,
        "stroke-opacity": 1,
      })
      .move(btlx * width, btly * height);
    this.g.add(this.rect);

    if (!state.config.thumbnail) {
      this.hideTitle = false;
      this.title = new Text()
        .plain(this.getLabelText(state))
        .fill("#FFFFFF")
        .font({
          family: "Palanquin",
          anchor: "middle",
          weight: "bold",
        })
        .move(btlx * width, btly * height);
      this.titleRect = new Rect().fill(TEXT_BG_COLOR);
      this.drawTitle(state);
      this.g.add(this.titleRect);
      this.g.add(this.title);
    }
  }

  containsPoint(state, [x, y]) {
    if (this.g.inside(x, y)) {
      return CONTAINS.CONTENT;
    }

    return CONTAINS.NONE;
  }

  draw(g, state) {
    const color = this.getColor(state);

    if (this.color !== color) {
      this.color = color;
      if (this.mask) {
        const img = this.createMask(state);
        this.img.replace(img);
        this.img = img;
      }
    }
    if (this.isShown(state)) {
      this.rect.attr({
        stroke: this.color,
        "stroke-width": state.strokeWidth,
      });

      if (!state.config.thumbnail) {
        this.drawTitle(state);
      }
    } else {
      this.g.hide();
    }

    g.add(this.g);
  }

  getMouseDistance(
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

  getPointInfo(state) {
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

  private sizeTitleRect(strokeWidth) {
    const titleBox = this.title.bbox();
    this.titleRect.size(titleBox.width + strokeWidth * 3, titleBox.height);
  }

  private drawTitle(state: Readonly<State>) {
    if (state.wheeling) {
      if (!this.hideTitle) {
        this.hideTitle = true;
        this.titleRect.remove();
        this.title.remove();
      }
      return;
    }

    let show = false;
    if (this.hideTitle) {
      this.hideTitle = false;
      show = true;
    }

    let fontChange = false;
    if (this.fontSize !== state.fontSize) {
      this.title.font({ size: state.fontSize });
      this.fontSize = state.fontSize;
      fontChange = true;
    }

    const labelText = this.getLabelText(state);
    const textUpdate = labelText !== this.labelText;

    if (textUpdate) {
      this.title.plain(this.getLabelText(state));
      this.sizeTitleRect(state.strokeWidth);
      this.labelText = labelText;
    }

    if (fontChange || this.strokeWidth !== state.strokeWidth || textUpdate) {
      const {
        strokeWidth,
        config: {
          dimensions: [width, height],
        },
      } = state;
      const {
        bounding_box: [btlx, btly],
      } = this.label;
      const [x, y]: Coordinates = [
        btlx * width + strokeWidth / 2,
        btly * height + strokeWidth / 2,
      ];

      !textUpdate && this.sizeTitleRect(strokeWidth);
      this.title.move(x + strokeWidth * 1.5, y - strokeWidth / 2);
      this.titleRect.move(x, y);
      this.strokeWidth = state.strokeWidth;
    }

    if (show) {
      this.g.add(this.titleRect);
      this.g.add(this.title);
    }
  }

  private getLabelText(state: Readonly<State>): string {
    let text =
      this.label.label && state.options.showLabel ? `${this.label.label} ` : "";

    if (state.options.showConfidence && !isNaN(this.label.confidence)) {
      text += `(${Number(this.label.confidence).toFixed(2)})`;
    }
    return text;
  }

  private createMask(state: Readonly<State>): Image {
    const {
      config: {
        dimensions: [width, height],
      },
    } = state;
    const {
      bounding_box: [btlx, btly, bw, bh],
    } = this.label;
    const [maskHeight, maskWidth] = this.mask.shape;
    const maskContext = DetectionOverlay.intermediateCanvas.getContext("2d");
    ensureCanvasSize(DetectionOverlay.intermediateCanvas, [
      maskWidth,
      maskHeight,
    ]);
    const maskImage = maskContext.createImageData(maskWidth, maskHeight);
    const maskImageRaw = new Uint32Array(maskImage.data.buffer);

    const bitColor = get32BitColor(this.color, MASK_ALPHA);
    for (let i = 0; i < this.mask.data.length; i++) {
      if (this.mask.data[i]) {
        maskImageRaw[i] = bitColor;
      }
    }
    maskContext.putImageData(maskImage, 0, 0);

    return new Image()
      .attr({
        preserveAspectRatio: "none",
        href: maskContext.canvas.toDataURL("image/png", 1),
      })
      .size(width * bw, height * bh)
      .move(btlx * width, btly * height);
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
