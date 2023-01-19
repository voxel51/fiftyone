/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getColor } from "@fiftyone/utilities";
import { ARRAY_TYPES, OverlayMask, TypedArray } from "../numpy";
import {
  BaseState,
  Coordinates,
  MaskTargets,
  Optional,
  RgbMaskTargets,
} from "../state";
import {
  BaseLabel,
  CONTAINS,
  isShown,
  Overlay,
  PointInfo,
  SelectData,
} from "./base";
import { isRgbMaskTargets, sizeBytes, strokeCanvasRect, t } from "./util";

interface SegmentationLabel extends BaseLabel {
  mask?: {
    data: OverlayMask;
    image: ArrayBuffer;
  };
}

interface SegmentationInfo extends BaseLabel {
  mask?: {
    shape: [number, number];
  };
}

export default class SegmentationOverlay<State extends BaseState>
  implements Overlay<State>
{
  readonly field: string;
  private label: SegmentationLabel;
  private targets?: TypedArray;
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;

  private isRgbMaskTargets = false;

  private rgbMaskTargetsReverseMap?: {
    [intTarget: number]: {
      label: string;
      color: string;
    };
  };

  constructor(field: string, label: SegmentationLabel) {
    this.field = field;
    this.label = label;
    if (!this.label.mask) {
      return;
    }
    const [height, width] = this.label.mask.data.shape;

    if (!height || !width) {
      return;
    }

    this.targets = new ARRAY_TYPES[this.label.mask.data.arrayType](
      this.label.mask.data.buffer
    );

    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    this.imageData = new ImageData(
      new Uint8ClampedArray(this.label.mask.image),
      width,
      height
    );
    const maskCtx = this.canvas.getContext("2d");
    maskCtx.imageSmoothingEnabled = false;
    maskCtx.clearRect(
      0,
      0,
      this.label.mask.data.shape[1],
      this.label.mask.data.shape[0]
    );
    maskCtx.putImageData(this.imageData, 0, 0);
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    const {
      pixelCoordinates: [x, y],
      dimensions: [w, h],
    } = state;
    if (x >= 0 && x <= w && y >= 0 && y <= h && this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>): void {
    if (!this.targets) {
      return;
    }

    if (this.imageData) {
      const [tlx, tly] = t(state, 0, 0);
      const [brx, bry] = t(state, 1, 1);
      const tmp = ctx.globalAlpha;
      ctx.globalAlpha = state.options.alpha;
      ctx.drawImage(this.canvas, tlx, tly, brx - tlx, bry - tly);
      ctx.globalAlpha = tmp;
    }

    if (this.isSelected(state)) {
      strokeCanvasRect(
        ctx,
        state,
        getColor(
          state.options.coloring.pool,
          state.options.coloring.seed,
          this.field
        )
      );
    }
  }

  getMouseDistance(state: Readonly<State>): number {
    if (this.containsPoint(state)) {
      return 0;
    }
    return Infinity;
  }

  initRgbMaskTargetsCache(rgbMaskTargets: MaskTargets) {
    if (!this.isRgbMaskTargets && isRgbMaskTargets(rgbMaskTargets)) {
      this.isRgbMaskTargets = true;
    }

    if (this.rgbMaskTargetsReverseMap) {
      return;
    }

    this.rgbMaskTargetsReverseMap = {};

    Object.entries(rgbMaskTargets).map(([color, intTargetAndLabel]) => {
      this.rgbMaskTargetsReverseMap[intTargetAndLabel.intTarget] = {
        color,
        label: intTargetAndLabel.label,
      };
    });
  }

  getPointInfo(state: Readonly<State>): Optional<PointInfo<SegmentationInfo>> {
    const coloring = state.options.coloring;
    let maskTargets = coloring.maskTargets[this.field];
    if (maskTargets) {
      maskTargets[this.field];
    }

    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }

    const target = this.getTarget(state);

    if (this.label.mask.data.channels > 2) {
      const rgbSegmentationInfoWithoutColor: Omit<
        PointInfo<SegmentationInfo>,
        "color"
      > = {
        label: {
          ...this.label,
          mask: {
            shape: this.label.mask.data.shape
              ? this.label.mask.data.shape
              : null,
          },
        },
        field: this.field,
        target,
        type: "Segmentation",
      };

      this.initRgbMaskTargetsCache(maskTargets);

      if (!this.isRgbMaskTargets) {
        // getting color here is computationally inefficient, return no tooltip ribbon color for this edge case
        return rgbSegmentationInfoWithoutColor;
      }

      if (
        !this.rgbMaskTargetsReverseMap ||
        !this.rgbMaskTargetsReverseMap[target]
      ) {
        return undefined;
      }

      return {
        color: this.rgbMaskTargetsReverseMap[target].color,
        label: {
          ...this.label,
          mask: {
            shape: this.label.mask.data.shape
              ? this.label.mask.data.shape
              : null,
          },
        },
        field: this.field,
        target,
        type: "Segmentation",
      };
    } else {
      return {
        color:
          maskTargets && Object.keys(maskTargets).length === 1
            ? getColor(
                state.options.coloring.pool,
                state.options.coloring.seed,
                this.field
              )
            : coloring.targets[
                Math.round(Math.abs(target)) % coloring.targets.length
              ],
        label: {
          ...this.label,
          mask: {
            shape: this.label.mask.data.shape
              ? this.label.mask.data.shape
              : null,
          },
        },
        field: this.field,
        target,
        type: "Segmentation",
      };
    }
  }

  getSelectData(): SelectData {
    return {
      id: this.label.id,
      field: this.field,
    };
  }

  isSelected(state: Readonly<State>): boolean {
    return state.options.selectedLabels.includes(this.label.id);
  }

  isShown(state: Readonly<State>): boolean {
    return isShown(state, this.field, this.label);
  }

  getPoints(): Coordinates[] {
    return getSegmentationPoints([]);
  }

  getSizeBytes(): number {
    return sizeBytes(this.label);
  }

  private getIndex(state: Readonly<State>): number {
    const [sx, sy] = this.getMaskCoordinates(state);
    if (sx < 0 || sy < 0) {
      return -1;
    }
    return this.label.mask.data.shape[1] * sy + sx;
  }

  private getMaskCoordinates({
    pixelCoordinates: [x, y],
    dimensions: [mw, mh],
  }: Readonly<State>): Coordinates {
    const [h, w] = this.label.mask.data.shape;
    const sx = Math.floor(x * (w / mw));
    const sy = Math.floor(y * (h / mh));
    return [sx, sy];
  }

  private getTarget(state: Readonly<State>): number {
    const index = this.getIndex(state);

    if (index < 0) {
      return null;
    }
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
