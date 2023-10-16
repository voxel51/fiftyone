/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getColor } from "@fiftyone/utilities";
import colorString from "color-string";
import { INFO_COLOR } from "../constants";
import {
  BaseState,
  Coloring,
  Coordinates,
  CustomizeColor,
  MaskTargets,
  RgbMaskTargets,
} from "../state";
import { BaseLabel, RegularLabel } from "./base";

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

export const getHashLabel = (label: RegularLabel): string => {
  if (["number", "string"].includes(typeof label.index)) {
    return `${label.label}.${label.index}`;
  } else {
    return `${label.label}.${label.id}`;
  }
};

type LabelColorProps = {
  coloring: Coloring;
  path: string;
  label: RegularLabel;
  isTagged: boolean;
  labelTagColors: CustomizeColor;
  customizeColorSetting: CustomizeColor[];
};

export const getLabelColor = ({
  coloring,
  path,
  label,
  isTagged,
  labelTagColors,
  customizeColorSetting,
}: LabelColorProps): string => {
  let key;
  const field = customizeColorSetting.find((s) => s.path === path);

  if (coloring.by === "instance") {
    return getColor(coloring.pool, coloring.seed, getHashLabel(label));
  }

  if (coloring.by === "field") {
    // if the label is tagged, use _label_tag color rules
    // otherwise use color rules for the field
    if (isTagged) {
      if (isValidColor(labelTagColors.fieldColor)) {
        return labelTagColors.fieldColor;
      }
      return getColor(coloring.pool, coloring.seed, "_label_tags");
    } else {
      if (isValidColor(field?.fieldColor)) {
        return field.fieldColor;
      }
      return getColor(coloring.pool, coloring.seed, path);
    }
  }

  if (coloring.by === "value") {
    if (isTagged) {
      // if the label's tag is currently active, use the _label_tag color rules
      // specified tag color > label tag field color > default label tag color

      const tagColor = labelTagColors.valueColors?.find((pair) =>
        label.tags.includes(pair.value)
      )?.color;
      if (isValidColor(tagColor)) {
        return tagColor;
      } else if (isValidColor(labelTagColors.fieldColor)) {
        return labelTagColors.fieldColor;
      } else {
        return getColor(coloring.pool, coloring.seed, "_label_tags");
      }
    } else {
      // if the field has custom color rules, use the field/value specific rules
      if (field) {
        if (field.colorByAttribute) {
          if (field.colorByAttribute === "index") {
            key = ["string", "number"].includes(typeof label.index)
              ? "index"
              : "id";
          } else {
            key = field.colorByAttribute;
          }
        } else {
          key = "label";
        }

        // use the first value as the fallback default if it's a listField
        const currentValue = Array.isArray(label[key])
          ? label[key][0]
          : label[key];
        // check if this label has a assigned color, use it if it is a valid color
        const valueColor = field?.valueColors?.find((l) => {
          if (["none", "null", "undefined"].includes(l.value?.toLowerCase())) {
            return typeof label[key] === "string"
              ? l.value?.toLowerCase === label[key]
              : !label[key];
          }
          if (["True", "False"].includes(l.value?.toString())) {
            return (
              l.value?.toString().toLowerCase() ==
              label[key]?.toString().toLowerCase()
            );
          }
          return Array.isArray(label[key])
            ? label[key]
                .map((list) => list.toString())
                .includes(l.value?.toString())
            : l.value?.toString() == label[key]?.toString();
        })?.color;
        return isValidColor(valueColor)
          ? valueColor
          : getColor(coloring.pool, coloring.seed, currentValue);
      } else {
        return getColor(coloring.pool, coloring.seed, label["label"]);
      }
    }
  }
};
