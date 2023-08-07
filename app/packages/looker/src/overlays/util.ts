/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import colorString from "color-string";
import { INFO_COLOR } from "../constants";
import { BaseState, Coordinates, MaskTargets, RgbMaskTargets } from "../state";
import { BaseLabel } from "./base";

export const t = (state: BaseState, x: number, y: number): Coordinates => {
  const [ctlx, ctly, cw, ch] = state.canvasBBox;
  return [ctlx + cw * x, ctly + ch * y];
};

export const sizeBytes = (label: BaseLabel) => {
  let bytes = 0;
  const sizer = (obj: any) => {
    if (obj instanceof ArrayBuffer) {
      bytes += obj.byteLength;
    } else if (obj !== null && obj !== undefined) {
      switch (typeof obj) {
        case "number":
          bytes += 8;
          break;
        case "string":
          bytes += obj.length * 2;
          break;
        case "boolean":
          bytes += 4;
          break;
        case "object":
          var objClass = Object.prototype.toString.call(obj).slice(8, -1);
          if (objClass === "Object" || objClass === "Array") {
            for (const key in obj) {
              if (!obj.hasOwnProperty(key)) continue;
              sizer(obj[key]);
            }
          } else bytes += obj.toString().length * 2;
          break;
      }
    }
  };

  sizer(label);

  return bytes;
};

const strokeRect = (
  ctx: CanvasRenderingContext2D,
  state: Readonly<BaseState>,
  color: string
) => {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(...t(state, 0, 0));
  ctx.lineTo(...t(state, 1, 0));
  ctx.lineTo(...t(state, 1, 1));
  ctx.lineTo(...t(state, 0, 1));
  ctx.closePath();
  ctx.stroke();
};

export const strokeCanvasRect = (
  ctx: CanvasRenderingContext2D,
  state: Readonly<BaseState>,
  color: string
): void => {
  ctx.lineWidth = state.strokeWidth;
  ctx.setLineDash([]);
  strokeRect(ctx, state, color);
  ctx.setLineDash([state.dashLength]);
  strokeRect(ctx, state, INFO_COLOR);
  ctx.setLineDash([]);
};

/**
 * Returns true if mask targets is RGB
 */
export function isRgbMaskTargets(
  maskTargets: MaskTargets
): maskTargets is RgbMaskTargets {
  if (!maskTargets || typeof maskTargets !== "object") {
    throw new Error("mask targets is invalid");
  }

  return Object.keys(maskTargets)[0]?.startsWith("#") === true;
}

// Return true is string is a valid color
export function isValidColor(color: string): boolean {
  return CSS.supports("color", color);
}

// Convert any valid css color to the hex color
export function convertToHex(color: string) {
  if (!isValidColor(color)) return null;
  const formatted = colorString.get(color);
  if (formatted) {
    return colorString.to.hex(formatted?.value);
  }
  return null;
}

export function normalizeMaskTargetsCase(maskTargets: MaskTargets) {
  if (!maskTargets || !isRgbMaskTargets(maskTargets)) {
    return maskTargets;
  }

  const normalizedMaskTargets: RgbMaskTargets = {};
  Object.entries(maskTargets).forEach(([key, value]) => {
    normalizedMaskTargets[key.toLocaleUpperCase()] = value;
  });
  return normalizedMaskTargets;
}

export const convertId = (obj: Record<string, any>): Record<string, any> => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.map((item) => ({ ...item, id: item["_id"] }))];
      }
      return [key, value];
    })
  );
};
