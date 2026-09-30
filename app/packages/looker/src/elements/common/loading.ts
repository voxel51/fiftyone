/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  lookerLoading,
  lookerLoadingBox,
  lookerLoadingBoxInner,
  lookerLoadingShown,
} from "./looker.module.css";

/**
 * Builds the thumbnail loading indicator: the multimodal grid tile's falling
 * ASCII box, centered on the tile's dark background. Hidden until
 * {@link setLoadingShown} says otherwise.
 */
export function createLoadingIndicator(): HTMLDivElement {
  const element = document.createElement("div");
  element.classList.add(lookerLoading);
  element.setAttribute("role", "status");
  element.setAttribute("aria-label", "Loading");

  const box = document.createElement("span");
  box.classList.add(lookerLoadingBox);
  box.setAttribute("aria-hidden", "true");

  const inner = document.createElement("span");
  inner.classList.add(lookerLoadingBoxInner);
  inner.textContent = "+--+\n|  |\n+--+";

  box.appendChild(inner);
  element.appendChild(box);
  return element;
}

/** Shows or hides an indicator built by {@link createLoadingIndicator}. */
export function setLoadingShown(element: HTMLElement, shown: boolean): void {
  element.classList.toggle(lookerLoadingShown, shown);
}
