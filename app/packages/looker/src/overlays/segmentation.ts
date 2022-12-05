/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { getColor } from "@fiftyone/utilities";
import { ARRAY_TYPES, NumpyResult, TypedArray } from "../numpy";
import { BaseState, Coordinates } from "../state";
import {
  BaseLabel,
  CONTAINS,
  isShown,
  Overlay,
  PointInfo,
  SelectData,
} from "./base";
import { DenseOverlay, getDenseOverlayWorker } from "./dense";
import { sizeBytes, strokeCanvasRect, t } from "./util";

interface SegmentationLabel extends BaseLabel {
  mask?: {
    data: NumpyResult;
    image: ArrayBuffer;
  };
  mask_path?: string;
}

interface SegmentationInfo extends BaseLabel {
  mask?: {
    shape: [number, number];
  };
}

const worker = getDenseOverlayWorker(() => {});
export default class SegmentationOverlay<
  State extends BaseState
> extends DenseOverlay<State> {
  readonly field: string;
  private label: SegmentationLabel;
  private targets?: TypedArray;
  private canvas: HTMLCanvasElement;
  private imageData: ImageData;

  private processing = false;

  constructor(field: string, label: SegmentationLabel) {
    super();
    this.field = field;
    this.label = label;
    console.log("In constructor of seg overlay");
  }

  async load(state: State) {
    if (!this.label.mask && !this.label.mask_path) {
      return;
    }

    if (this.processing || this.processed) {
      return;
    }

    this.processing = true;

    return new Promise<void>((mainResolve) => {
      new Promise<void>((resolve) => {
        if (this.label.mask_path) {
          worker.postMessage({
            method: "processDenseLabel",
            label: this.label,
          });

          const listener = ({ data: { method, label } }) => {
            if (label.id !== this.label.id) {
              return;
            }

            if (method === "processDenseLabel") {
              this.label = label;
              worker.removeEventListener("message", listener);
              resolve();
            }
          };
          worker.addEventListener("message", listener);
        } else {
          resolve();
        }
      }).then(() => {
        this.color(state).then(() => {
          mainResolve();
        });
      });
    });
  }

  async color(state: State) {
    if (!this.label.mask || !(this.label.mask.data.buffer.byteLength > 0)) {
      return;
    }

    const buffers = [this.label.mask.data.buffer, this.label.mask.image];
    worker.postMessage(
      {
        method: "colorDenseOverlay",
        label: this.label,
        field: this.field,
        coloring: state.options.coloring,
      },
      buffers
    );

    return new Promise<void>((resolve) => {
      const listener = ({ data: { method, label } }) => {
        if (method === "colorDenseOverlay" && this.label.id === label.id) {
          this.label = label;
          worker.removeEventListener("message", listener);
          this.processed = true;

          // copied from constructor
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
          resolve();
        }
      };
      worker.addEventListener("message", listener);
    });
  }

  containsPoint(state: Readonly<State>): CONTAINS {
    if (!this.processed) {
      return CONTAINS.NONE;
    }

    const {
      pixelCoordinates: [x, y],
      dimensions: [w, h],
    } = state;
    if (x >= 0 && x <= w && y >= 0 && y <= h && this.getTarget(state)) {
      return CONTAINS.CONTENT;
    }
    return CONTAINS.NONE;
  }

  draw(ctx: CanvasRenderingContext2D, state: Readonly<State>) {
    if (!this.targets) {
      return;
    }

    // if (this.imageData && !this.processed) {
    //   await this.color(state);
    // }

    if (this.imageData && this.processed) {
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

  getPointInfo(state: Readonly<State>): PointInfo<SegmentationInfo> {
    const target = this.getTarget(state);
    const coloring = state.options.coloring;
    let maskTargets = coloring.maskTargets[this.field];
    if (maskTargets) {
      maskTargets[this.field];
    }

    if (!maskTargets) {
      maskTargets = coloring.defaultMaskTargets;
    }

    const color =
      maskTargets && Object.keys(maskTargets).length === 1
        ? getColor(
            state.options.coloring.pool,
            state.options.coloring.seed,
            this.field
          )
        : coloring.targets[
            Math.round(Math.abs(target)) % coloring.targets.length
          ];

    return {
      color,
      label: {
        ...this.label,
        mask: {
          shape: this.label.mask.data.shape ? this.label.mask.data.shape : null,
        },
      },
      field: this.field,
      target,
      type: "Segmentation",
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
