/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { prettify as pretty, useExternalLink } from "@fiftyone/utilities";

import { Overlay } from "../../overlays/base";
import { BaseState } from "../../state";
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
