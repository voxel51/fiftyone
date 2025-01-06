/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { COLOR_BY, REGRESSION, getColor } from "@fiftyone/utilities";
import colorString from "color-string";
import { INFO_COLOR } from "../constants";
import type {
  BaseState,
  Coloring,
  Coordinates,
  CustomizeColor,
  LabelTagColor,
  MaskTargets,
  RgbMaskTargets,
} from "../state";
import type { RegularLabel } from "./base";

export const t = (state: BaseState, x: number, y: number): Coordinates => {
  const [ctlx, ctly, cw, ch] = state.canvasBBox;
  return [ctlx + cw * x, ctly + ch * y];
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
export function isValidColor(color: string | undefined | null): boolean {
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
  if (["number", "string"].includes(typeof label?.index)) {
    return `${label.label}.${label.index}`;
  }
  if (typeof label?.label !== "undefined" && typeof label?.id !== "undefined") {
    return `${label.label}.${label.id}`;
  }
  return `${label.label}`;
};

export const shouldShowLabelTag = (
  selectedLabelTags: string[], // labelTags that are active
  labelTags: string[] // current label's tags
) => {
  return (
    (selectedLabelTags?.length == 0 && labelTags.length > 0) ||
    selectedLabelTags?.some((tag) => labelTags.includes(tag))
  );
};

type LabelColorProps = {
  coloring: Coloring;
  path: string;
  label: RegularLabel;
  isTagged: boolean;
  labelTagColors: LabelTagColor;
  customizeColorSetting: CustomizeColor[];
  is3D?: boolean;
  embeddedDocType: string;
};

export const getLabelColor = ({
  coloring,
  path,
  label,
  isTagged,
  labelTagColors,
  customizeColorSetting,
  is3D = false,
  embeddedDocType,
}: LabelColorProps): string => {
  const field = customizeColorSetting.find((s) => s.path === path);

  if (coloring.by === COLOR_BY.INSTANCE) {
    return getColor(coloring.pool, coloring.seed, getHashLabel(label));
  }

  if (coloring.by === COLOR_BY.FIELD) {
    // if the label is tagged, use _label_tags color rules
    // otherwise use color rules for the field
    if (isTagged) {
      return getLabelColorByField({
        path: "_label_tags",
        coloring,
        fieldColor: labelTagColors?.fieldColor,
      });
    } else {
      return getLabelColorByField({
        path,
        coloring,
        fieldColor: field?.fieldColor,
      });
    }
  }

  if (coloring.by === COLOR_BY.VALUE) {
    if (isTagged) {
      // if the label's tag is currently active, use the _label_tags color rules
      // specified tag color > color by label tag's value > label tag field color > default label tag color

      const tagColor = labelTagColors?.valueColors?.find((pair) =>
        label.tags.includes(pair.value)
      )?.color;

      if (isValidColor(tagColor)) {
        return tagColor;
      } else {
        return getLabelColorByField({
          path: label.tags.length > 0 ? label.tags[0] : "_Label_tags",
          coloring,
          fieldColor: labelTagColors?.fieldColor,
        });
      }
    } else {
      // if the field has custom color rules, use the field/value specific rules
      return getLabelColorByValue({
        field,
        label,
        coloring,
        is3D,
        embeddedDocType,
      });
    }
  }

  return getColor(coloring.pool, coloring.seed, path);
};

const getLabelColorByField = ({
  path,
  coloring,
  fieldColor,
}: {
  path: string;
  coloring: Coloring;
  fieldColor: string | undefined;
}) => {
  if (isValidColor(fieldColor)) {
    return fieldColor;
  }
  return getColor(coloring.pool, coloring.seed, path);
};

const getLabelColorKey = (
  field: CustomizeColor,
  label: RegularLabel,
  is3D: boolean,
  embeddedDocType: string
) => {
  let key;
  if (field.colorByAttribute) {
    if (field.colorByAttribute === "index") {
      key = ["string", "number"].includes(typeof label.index)
        ? "index"
        : is3D
        ? "_id"
        : "id";
    } else {
      key = field.colorByAttribute;
    }
  } else {
    key = embeddedDocType === REGRESSION ? "value" : "label";
  }
  return key;
};

const getLabelColorByValue = ({
  field,
  label,
  coloring,
  is3D,
  embeddedDocType,
}: {
  field?: CustomizeColor;
  label: RegularLabel;
  coloring: Coloring;
  is3D: boolean;
  embeddedDocType: string;
}) => {
  let key;
  if (field) {
    key = getLabelColorKey(field, label, is3D, embeddedDocType);
    // use the first value as the fallback value to get color,
    // if it's a listField
    const fallbackValue =
      Array.isArray(label[key]) && label[key].length > 0
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
      : getColor(coloring.pool, coloring.seed, fallbackValue);
  } else {
    key = embeddedDocType === REGRESSION ? "value" : "label";
    return getColor(coloring.pool, coloring.seed, label[key]);
  }
};
