/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import {
  getColor,
  prettify as pretty,
  useExternalLink,
} from "@fiftyone/utilities";

import { Overlay, RegularLabel } from "../../overlays/base";
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
  label.setAttribute("data-cy", `looker-checkbox-${text}`);
  label.classList.add(lookerLabel);
  label.innerHTML = text;

  const checkbox = document.createElement("input");
  checkbox.setAttribute("data-cy", `looker-checkbox-input-${text}`);
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

function findColorSetting(
  customizeColorSetting: CustomizeColor[],
  path: string
) {
  return customizeColorSetting.find((s) => s.path === path);
}

function getFallbackColor(
  pool: readonly string[],
  seed: number,
  path: string,
  value: string | number | boolean,
  valueMode: boolean
) {
  const fallbackColorByField = getColor(pool, seed, path);
  return ![undefined, null].includes(value) && valueMode
    ? getColor(pool, seed, value)
    : fallbackColorByField;
}

function getColorByField(
  setting: CustomizeColor,
  pool: readonly string[],
  seed: number,
  path: string,
  isValidColor: (string) => boolean
) {
  if (isValidColor(setting?.fieldColor)) {
    return setting.fieldColor;
  }
  return getColor(pool, seed, path);
}

function getCurrentValue(
  isPrimitive: boolean,
  setting: CustomizeColor,
  param: string | RegularLabel | Regression,
  fallbackLabel: string,
  value: string | number | boolean
) {
  const key = setting?.colorByAttribute ?? fallbackLabel;
  let currentValue;

  if (!isPrimitive) {
    const convertedKey = ![undefined, null].includes(param[key])
      ? key
      : fallbackLabel;
    currentValue = !isPrimitive
      ? Array.isArray(param[key])
        ? param[convertedKey][0]
        : param[convertedKey]
      : null;
  } else {
    currentValue = value.toString();
  }

  return currentValue;
}

function getTagColor(
  setting: CustomizeColor,
  pool: readonly string[],
  seed: number,
  param: string | RegularLabel | Regression,
  isValidColor: (string) => boolean
) {
  const valueColor = setting.valueColors?.find(
    (v) => v.value === (param as string)
  )?.color;

  if (isValidColor(valueColor)) {
    return valueColor;
  }

  return getColor(pool, seed, param as string);
}

function getTargetColor(
  isPrimitive: boolean,
  setting: CustomizeColor,
  param: string | RegularLabel | Regression,
  key: string,
  value: string | number | boolean,
  currentValue: string
) {
  return setting.valueColors?.find((colorSetup) => {
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
    if (!isPrimitive) {
      if (Array.isArray(param[key])) {
        return param[key].map((el) => el.toString()).includes(stringifiedValue);
      }
      return stringifiedValue === currentValue?.toString();
    } else {
      if (typeof value === "string" && value.includes(", ")) {
        return value
          .split(", ")
          .map((el) => el.toString())
          .includes(stringifiedValue);
      }

      return stringifiedValue === value.toString();
    }
  })?.color;
}

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
  const setting = findColorSetting(customizeColorSetting, path);
  const isPrimitive = ![null, undefined].includes(value);
  const { by, seed, pool } = coloring;
  const fallbackColor = getFallbackColor(
    pool,
    seed,
    path,
    value,
    by === "value"
  );

  if (by === "field") {
    return getColorByField(setting, pool, seed, path, isValidColor);
  }

  if (by === "value") {
    if (!setting) {
      return isPrimitive
        ? fallbackColor
        : getColor(pool, seed, path === "tags" ? param : param[fallbackLabel]);
    }

    const currentValue = getCurrentValue(
      isPrimitive,
      setting,
      param,
      fallbackLabel,
      value
    );

    if (path === "tags") {
      return getTagColor(setting, pool, seed, param, isValidColor);
    }

    const targetColor = getTargetColor(
      isPrimitive,
      setting,
      param,
      setting.colorByAttribute ?? fallbackLabel,
      value,
      currentValue
    );

    if (isValidColor(targetColor)) {
      return targetColor;
    }

    return getColor(pool, seed, currentValue);
  }

  return getColor(coloring.pool, coloring.seed, path);
}
