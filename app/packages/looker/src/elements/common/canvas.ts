/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, Coordinates, Optional } from "../../state";
import { clampScale } from "../../util";
import { BaseElement, Events } from "../base";
import { dispatchTooltipEvent } from "./util";

import { mediaLoading, mediaOrCanvas } from "../media.module.css";

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
          2500
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
          newState.canZoom = false;
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
      dblclick: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          return thumbnail ? {} : { scale: 1, pan: [0, 0], canZoom: true };
        });
      },
      wheel: ({ event, update, dispatchEvent }) => {
        update(
          ({
            config: { thumbnail, dimensions },
            pan: [px, py],
            scale,
            windowBBox: [tlx, tly, width, height],
          }) => {
            if (thumbnail) {
              return {};
            }
            event.preventDefault();

            const x = event.x - tlx;
            const y = event.y - tly;

            const xs = (x - px) / scale;
            const ys = (y - py) / scale;
            const newScale = clampScale(
              [width, height],
              dimensions,
              event.deltaY < 0 ? scale * SCALE_FACTOR : scale / SCALE_FACTOR
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
              canZoom: false,
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
    element.classList.add(mediaOrCanvas, mediaLoading);
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
    }
    if (this.height !== height) {
      this.element.height = height;
    }
    if (panning) {
      this.element.style.cursor !== "all-scroll" &&
        (this.element.style.cursor = "all-scroll");
    } else if (!thumbnail && mouseIsOnOverlay && !disableOverlays) {
      this.element.style.cursor = "pointer";
    } else if (thumbnail) {
      this.element.style.cursor = "unset";
    } else {
      this.element.style.cursor = "default";
    }

    if (this.loaded !== loaded) {
      this.element.classList.remove(mediaLoading);
      this.loaded = loaded;
    }

    return this.element;
  }

  private getPan([x, y]: Coordinates): Coordinates {
    const [sx, sy] = this.start;
    return [x - sx, y - sy];
  }
}
