/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, Coordinates, Optional } from "../../state";
import { clampScale } from "../../util";
import { BaseElement, Events } from "../base";
import { dispatchTooltipEvent } from "./util";

import { invisible, mediaOrCanvas } from "../media.module.css";

export class CanvasElement<State extends BaseState> extends BaseElement<
  State,
  HTMLCanvasElement
> {
  private width: number = 0;
  private height: number = 0;
  private mousedownCoordinates?: Coordinates;
  private mousedown: boolean = false;
  private hideControlsTimeout: ReturnType<typeof setTimeout> | null = null;
  private start: Coordinates = [0, 0];
  private wheelTimeout: ReturnType<typeof setTimeout> | null = null;
  private loaded: boolean = true;
  private cursor: string;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        update({ showOptions: false }, (state, overlays) => {
          if (state.config.thumbnail || state.disableOverlays) {
            return;
          }
          let moved = false;
          if (this.mousedownCoordinates) {
            moved =
              event.pageX !== this.mousedownCoordinates[0] ||
              event.pageY !== this?.mousedownCoordinates[1];
          }

          if (!moved && overlays.length) {
            const top = overlays[0];
            top.containsPoint(state) &&
              dispatchEvent("select", top.getSelectData(state));
          }
        });
      },
      mouseleave: ({ dispatchEvent }) => {
        this.mousedown = false;
        dispatchEvent("tooltip", null);
      },
      mousemove: ({ event, update, dispatchEvent }) => {
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
        }
        this.hideControlsTimeout = setTimeout(
          () =>
            update(({ showOptions, hoveringControls }) => {
              this.hideControlsTimeout = null;
              if (!showOptions && !hoveringControls) {
                return { showControls: false };
              }
              return {};
            }),
          3500
        );
        update((state) => {
          if (state.config.thumbnail) {
            return {};
          }
          const newState: Optional<State> = {
            cursorCoordinates: [
              (<MouseEvent>event).pageX,
              (<MouseEvent>event).pageY,
            ],
            rotate: 0,
            showControls: true,
          };
          if (!this.mousedown) {
            return newState;
          }
          newState.pan = this.getPan([event.pageX, event.pageY]);
          newState.panning = true;
          return newState;
        }, dispatchTooltipEvent(dispatchEvent));
      },
      mousedown: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [x, y] }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
          this.mousedown = true;
          this.mousedownCoordinates = [event.pageX, event.pageY];
          this.start = [event.pageX - x, event.pageY - y];
          return {};
        });
      },
      mouseup: ({ event, update }) => {
        update((state) => {
          this.mousedown = false;
          if (state.config.thumbnail || !state.panning) {
            return {};
          }
          event.preventDefault();
          return {
            panning: false,
            pan: this.getPan([event.pageX, event.pageY]),
          };
        });
      },
      wheel: ({ event, update, dispatchEvent }) => {
        update(
          ({
            config: { thumbnail, dimensions },
            pan: [px, py],
            scale,
            windowBBox: [tlx, tly, width, height],
            options: { zoomPad },
          }) => {
            const x = event.x - tlx;
            const y = event.y - tly;

            const xs = (x - px) / scale;
            const ys = (y - py) / scale;
            const newScale = clampScale(
              [width, height],
              dimensions,
              event.deltaY < 0 ? scale * SCALE_FACTOR : scale / SCALE_FACTOR,
              zoomPad
            );

            if (scale === newScale) {
              return {};
            }

            if (this.wheelTimeout) {
              clearTimeout(this.wheelTimeout);
            }

            this.wheelTimeout = setTimeout(() => {
              this.wheelTimeout = null;
              update({ wheeling: false });
            }, 200);

            return {
              pan: [x - xs * newScale, y - ys * newScale],
              scale: newScale,
              cursorCoordinates: [
                (<MouseEvent>event).pageX,
                (<MouseEvent>event).pageY,
              ],
              wheeling: true,
            };
          },
          dispatchTooltipEvent(dispatchEvent)
        );
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("canvas");
    element.classList.add(mediaOrCanvas, invisible);
    return element;
  }

  renderSelf({
    loaded,
    config: { thumbnail },
    panning,
    windowBBox: [_, __, width, height],
    mouseIsOnOverlay,
    disableOverlays,
  }: Readonly<State>) {
    if (this.width !== width) {
      this.element.width = width;
      this.width = width;
    }
    if (this.height !== height) {
      this.element.height = height;
      this.height = height;
    }

    const cursor = this.cursor;
    if (panning) {
      cursor !== "all-scroll" && (this.cursor = "all-scroll");
    } else if (thumbnail || (mouseIsOnOverlay && !disableOverlays)) {
      cursor !== "pointer" && (this.cursor = "pointer");
    } else if (thumbnail) {
      cursor !== "unset" && (this.cursor = "unset");
    } else if (cursor !== "default") {
      this.cursor = "default";
    }

    if (this.cursor !== cursor) {
      this.element.style.cursor = this.cursor;
    }

    if (this.loaded !== loaded) {
      this.element.classList.remove(invisible);
      this.loaded = loaded;
    }

    return this.element;
  }

  private getPan([x, y]: Coordinates): Coordinates {
    const [sx, sy] = this.start;
    return [x - sx, y - sy];
  }
}
