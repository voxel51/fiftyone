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
import { BaseState, Coloring, CustomizeColor } from "../../state";
import { DispatchEvent } from "../../state";

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

    let detail =
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

// for classification types and regression types
type Param = {
  coloring: Coloring;
  path: string;
  param: Classification | Regression;
  customizeColorSetting: CustomizeColor[];
  labelDefault: boolean; // use .label or .value as default
};
export const getColorFromOptions = ({
  coloring,
  path,
  param,
  customizeColorSetting,
  labelDefault,
}: Param) => {
  let key;
  switch (coloring.by) {
    case "field":
      const customSetting = customizeColorSetting.find((s) => s.field === path);
      const fieldColor = customSetting?.fieldColor;
      const useFieldColor = customSetting?.useFieldColor;
      if (fieldColor && useFieldColor && isValidColor(fieldColor)) {
        return fieldColor;
      }
      // fall back on default setting:
      return getColor(coloring.pool, coloring.seed, path);
    case "value":
    default:
      const setting = customizeColorSetting.find((s) => s.field === path);
      if (setting) {
        key = setting.attributeForColor ?? labelDefault ? "label" : "value";
        // check if this label has a assigned color, use it if it is a valid color
        const labelColor = setting.labelColors?.find(
          (l) => l.name == param[key]?.toString()
        )?.color;

        if (isValidColor(labelColor)) {
          return labelColor;
        }
      } else {
        key = labelDefault ? "label" : "value";
      }
      return getColor(coloring.pool, coloring.seed, param[key]);
  }
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
  switch (coloring.by) {
    case "field":
      const customSetting = customizeColorSetting.find((s) => s.field === path);
      const fieldColor = customSetting?.fieldColor;
      const useFieldColor = customSetting?.useFieldColor;
      if (fieldColor && useFieldColor && isValidColor(fieldColor)) {
        return fieldColor;
      }
      // fall back on default setting:
      return getColor(coloring.pool, coloring.seed, path);
    case "value":
    default:
      const setting = customizeColorSetting.find((s) => s.field === path);
      if (setting) {
        // check if this label has a assigned color, use it if it is a valid color
        const labelColor = setting.labelColors?.find(
          (l) => l.name == value
        )?.color;
        if (isValidColor(labelColor)) {
          return labelColor;
        }
      }
      return getColor(coloring.pool, coloring.seed, path);
  }
};
