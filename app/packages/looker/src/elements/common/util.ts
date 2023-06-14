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
import { isValidColor } from "../../overlays/util";
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

// for classification types and regression and sample tag types
type Param = {
  coloring: Coloring;
  path: string;
  param: Classification | Regression | string;
  customizeColorSetting?: CustomizeColor[];
  labelTagColors?: CustomizeColor;
  labelDefault: boolean; // use .label for classification or .value for regression
};

export const getColorFromOptions = ({
  coloring,
  path,
  param,
  customizeColorSetting,
  labelTagColors,
  labelDefault,
}: Param) => {
  const setting =
    path === "_label_tags"
      ? labelTagColors
      : customizeColorSetting.find((s) => s.path === path);
  if (coloring.by === "field") {
    return getFieldColor(coloring, path, setting);
  }
  const key =
    !["tags", "_label_tags"].includes(path) && setting
      ? setting.colorByAttribute ?? (labelDefault ? "label" : "value")
      : labelDefault
      ? "label"
      : "value";
  return getValueColor(coloring, path, setting, param[key], param);
};

// for primitive types
type PrimitiveParam = {
  coloring: Coloring;
  path: string;
  value: string | number | boolean | { datetime: number };
  customizeColorSetting: CustomizeColor[];
};
export const getColorFromOptionsPrimitives = ({
  coloring,
  path,
  value,
  customizeColorSetting,
}: PrimitiveParam) => {
  const setting = customizeColorSetting.find((s) => s.path === path);
  if (coloring.by === "field") {
    return getFieldColor(coloring, path, setting);
  }
  return getValueColor(coloring, path, setting, value, value);
};

// helper function to handle the field color
const getFieldColor = (coloring, path, setting) => {
  if (isValidColor(setting?.fieldColor ?? "")) {
    return setting?.fieldColor;
  }
  return getColor(coloring.pool, coloring.seed, path);
};

// helper function to handle the value color
const getValueColor = (coloring, path, setting, key, param) => {
  if (setting) {
    const valueColor = setting.valueColors?.find((l) => {
      const normalized = l.value?.toString().toLowerCase();
      if (["none", "null", "undefined"].includes(normalized)) {
        return typeof param === "string"
          ? normalized === param.toLowerCase()
          : !param;
      }
      if (["True", "False"].includes(l.value?.toString())) {
        return normalized === param.toString().toLowerCase();
      }
      return l.value?.toString() === param.toString();
    })?.color;

    if (isValidColor(valueColor)) {
      return valueColor;
    }
  }
  return getColor(coloring.pool, coloring.seed, key);
};
