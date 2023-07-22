/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import {
  getColor,
  prettify as pretty,
  useExternalLink,
} from "@fiftyone/utilities";

import { Overlay } from "../../overlays/base";
import { Classification, Regression } from "../../overlays/classifications";
import {
  BaseState,
  Coloring,
  CustomizeColor,
  DispatchEvent,
} from "../../state";

import { lookerCheckbox, lookerLabel } from "./util.module.css";

export const dispatchTooltipEvent = <State extends BaseState>(
  dispatchEvent: DispatchEvent,
  nullify = false
) => {
  return (state: Readonly<State>, overlays: Readonly<Overlay<State>[]>) => {
    if (
      (!state.options.showTooltip ||
        !state.options.showOverlays ||
        state.config.thumbnail ||
        state.disableOverlays) &&
      !nullify
    ) {
      return;
    }

    const detail =
      overlays.length && overlays[0].containsPoint(state) && !nullify
        ? overlays[0].getPointInfo(state)
        : null;

    // @ts-ignore
    if (state.frameNumber && detail) {
      // @ts-ignore
      detail.frameNumber = state.frameNumber;
    }
    dispatchEvent(
      "tooltip",
      detail
        ? {
            ...detail,
            coordinates: state.cursorCoordinates,
          }
        : null
    );
  };
};

export const makeCheckboxRow = function (
  text: string,
  checked: boolean
): [HTMLLabelElement, HTMLInputElement] {
  const label = document.createElement("label");
  label.classList.add(lookerLabel);
  label.innerHTML = text;

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.checked = checked;
  const span = document.createElement("span");
  span.classList.add(lookerCheckbox);
  label.appendChild(checkbox);
  label.appendChild(span);

  return [label, checkbox];
};

export const prettify = (
  v: boolean | string | null | undefined | number | number[]
): string | HTMLAnchorElement => {
  const result = pretty(v);

  if (result instanceof URL) {
    const url = result.toString();
    const onClick = useExternalLink(url);

    const a = document.createElement("a");
    a.onclick = onClick;
    a.href = url;
    a.innerHTML = url;
    return a;
  }

  return result;
};

type ColorParams = {
  coloring: Coloring;
  path: string;
  // if embeddedDocumentField or tags
  param?: Classification | Regression | string;
  // fallback for index key, defaulted to "id" (not applicable for primitive fields)
  fallbackIndex?: string;
  // fallback for label key, defaulted to "label" (not applicable for primitive fields)
  fallbackLabel?: string;
  // if primitive fields
  value?: string | number | boolean;
  customizeColorSetting: CustomizeColor[];
  isValidColor: (string) => boolean;
};

export function getAssignedColor({
  coloring,
  path,
  param,
  fallbackLabel = "label",
  value,
  customizeColorSetting,
  isValidColor,
}: ColorParams): string {
  const setting = customizeColorSetting.find((s) => s.path === path);
  const isPrimitive = ![null, undefined].includes(value); // for readability
  const { by, seed, pool } = coloring;
  const fallbackColorByField = getColor(pool, seed, path);
  const fallbackColorByValuePrimitive = ![undefined, null].includes(value)
    ? getColor(pool, seed, value)
    : fallbackColorByField;

  /* In color by field mode, if ColorScheme setting has a valid field level color setting
  for the field, use the field level color setting, 
  otherwise fallback on the default color based on its path.*/

  if (by === "field") {
    if (isValidColor(setting?.fieldColor)) {
      return setting.fieldColor;
    }
    return getColor(pool, seed, path);
  }

  /* In color by field mode, 
  if ColorScheme setting has special color rule of current field,
  if current field is a primitive field, find matching value in valueColors directly;
  if current field is a embeddedDocumentField, use colorByAttribute as the key in param
  to find matching value in valueColors. */

  if (by === "value") {
    if (!setting) {
      return isPrimitive
        ? fallbackColorByValuePrimitive
        : getColor(pool, seed, fallbackLabel);
    }

    // For embeddedDocumentField, use colorByAttribute as the key in param or use
    // the fallbackLabel defaulted to 'label', regression uses 'value'

    const key = setting.colorByAttribute ?? fallbackLabel;
    let currentValue;

    if (!isPrimitive) {
      const convertedKey = ![undefined, null].includes(param[key])
        ? key
        : fallbackLabel;
      // use the first value as the fallback default if it's a listField for embeddedDoc
      currentValue = !isPrimitive
        ? Array.isArray(param[key])
          ? param[convertedKey][0]
          : param[convertedKey]
        : null;
    } else {
      currentValue = value;
    }

    // sample tags
    if (path === "tags") {
      const valueColor = setting.valueColors?.find(
        (v) => v.value === param
      )?.color;
      if (isValidColor(valueColor)) {
        return valueColor;
      } else {
        return getColor(pool, seed, param);
      }
    }

    // check if current attribute value or field value has an assigned color
    const targetColor = setting.valueColors?.find((colorSetup) => {
      const stringifiedLowercaseValue = colorSetup.value
        ?.toString()
        .toLowerCase();
      const stringifiedValue = colorSetup.value?.toString();
      if (["none", "null", "undefined"].includes(stringifiedLowercaseValue)) {
        if (isPrimitive) {
          return typeof value === "string"
            ? colorSetup.value?.toString().toLowerCase() === value.toLowerCase()
            : !value;
        } else {
          return typeof param[key] === "string"
            ? colorSetup.value?.toLowerCase === param[key]
            : !param[key];
        }
      }
      if (["true", "false"].includes(stringifiedLowercaseValue)) {
        if (isPrimitive) {
          return stringifiedLowercaseValue === value.toString().toLowerCase();
        } else {
          return (
            stringifiedLowercaseValue === param[key]?.toString().toLowerCase()
          );
        }
      }
      // listField, IntField, StringField values
      if (!isPrimitive) {
        if (Array.isArray(param[key])) {
          return param[key]
            .map((el) => el.toString())
            .includes(stringifiedValue);
        } else {
          return stringifiedValue === currentValue?.toString();
        }
      } else {
        // check for listField and do necessary conversion
        if (typeof value === "string" && value.includes(", ")) {
          return value
            .split(", ")
            .map((el) => el.toString())
            .includes(stringifiedValue);
        } else {
          return stringifiedValue === value.toString();
        }
      }
    })?.color;

    if (isValidColor(targetColor)) {
      return targetColor;
    }

    if (!isPrimitive) {
      return getColor(pool, seed, currentValue);
    }
  }

  return getColor(coloring.pool, coloring.seed, path);
}
