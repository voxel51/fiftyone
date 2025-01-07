/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { getColor, sizeBytesEstimate } from "@fiftyone/utilities";
import type { BaseState, Coordinates } from "../state";
import type { TypedArray } from "../worker/decoders/types";
import { ARRAY_TYPES } from "../worker/decoders/types";
import type {
  BaseLabel,
  LabelMask,
  Overlay,
  PointInfo,
  SelectData,
} from "./base";
import { CONTAINS, isShown } from "./base";
import { strokeCanvasRect, t } from "./util";

export interface PanopticSegmentationLabel extends BaseLabel {
  mask?: LabelMask;
}

interface PanopticSegmentationInfo extends BaseLabel {
  instance?: number;
  mask?: {
    shape: [number, number];
  };
}

export default class PanopticSegmentationOverlay<State extends BaseState>
  implements Overlay<State>
{
  readonly field: string;
  readonly label: PanopticSegmentationLabel;
  private targets?: TypedArray;

  constructor(field: string, label: PanopticSegmentationLabel) {
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

    if (this.label.mask?.bitmap) {
      const [tlx, tly] = t(state, 0, 0);
      const [brx, bry] = t(state, 1, 1);
      const tmp = ctx.globalAlpha;
      ctx.globalAlpha = state.options.alpha;
      ctx.drawImage(this.label.mask.bitmap, tlx, tly, brx - tlx, bry - tly);
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
    return Number.Infinity;
  }

  getPointInfo(
    state: Readonly<State>
  ): Partial<PointInfo<PanopticSegmentationInfo>> {
    const coloring = state.options.coloring;
    let maskTargets = coloring.maskTargets[this.field];
    if (maskTargets) {
      maskTargets[this.field];
    }

    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }

    const target = this.getTarget(state);

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
      field: this.field,
      label: {
        ...this.label,
        mask: {
          shape: this.label.mask.data.shape ? this.label.mask.data.shape : null,
        },
      },

      instance: this.getInstance(state),
      target,
      type: "PanopticSegmentation",
    };
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
    return getPanopticSegmentationPoints([]);
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

  private getInstance(state: Readonly<State>): number | null {
    const [sx, sy] = this.getMaskCoordinates(state);
    if (sx < 0 || sy < 0) {
      return null;
    }

    const [height] = this.label.mask.data.shape;
    const offset = height * 2 * sx + height + sy;
    if (offset >= this.targets.length) {
      return null;
    }

    return Number(this.targets[offset]);
  }

  private getTarget(state: Readonly<State>): number {
    const [sx, sy] = this.getMaskCoordinates(state);
    if (sx < 0 || sy < 0) {
      return null;
    }

    const [height] = this.label.mask.data.shape;
    const offset = height * 2 * sx + sy;
    if (offset >= this.targets.length) {
      return null;
    }

    return Number(this.targets[offset]);
  }

  getSizeBytes(): number {
    return sizeBytesEstimate(this.label);
  }

  public cleanup(): void {
    this.label.mask?.bitmap?.close();
  }
}

export const getPanopticSegmentationPoints = (
  _: PanopticSegmentationLabel[]
): Coordinates[] => {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
};
