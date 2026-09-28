/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { cssVar } from "@voxel51/voodo";
import {
  lookerBuffering,
  lookerBufferingArc,
  lookerBufferingIcon,
  lookerBufferingRing,
  lookerBufferingShown,
} from "./looker.module.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds the thumbnail buffering indicator: the VOODO Spinner's icon (a faint
 * ring with a bright quarter arc) on a dark disc in the tile's top right, the
 * same indicator the multimodal grid tile shows. Hidden until
 * {@link setBufferingShown} says otherwise.
 */
export function createBufferingIndicator(): HTMLDivElement {
  const element = document.createElement("div");
  element.classList.add(lookerBuffering);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add(lookerBufferingIcon);
  svg.style.color = cssVar.color.text.primary;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.classList.add(lookerBufferingRing);
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "12");
  ring.setAttribute("r", "10");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "4");

  const arc = document.createElementNS(SVG_NS, "path");
  arc.classList.add(lookerBufferingArc);
  arc.setAttribute("fill", "currentColor");
  arc.setAttribute(
    "d",
    "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z",
  );

  svg.append(ring, arc);
  element.appendChild(svg);
  return element;
}

/** Shows or hides an indicator built by {@link createBufferingIndicator}. */
export function setBufferingShown(element: HTMLElement, shown: boolean): void {
  element.classList.toggle(lookerBufferingShown, shown);
}
