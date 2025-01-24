/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, Coordinates } from "../../state";
import { clampScale, getDPR } from "../../util";
import { BaseElement, Events } from "../base";
import { dispatchTooltipEvent } from "./util";

import { invisible, lookerCanvas } from "./canvas.module.css";

export class CanvasElement<State extends BaseState> extends BaseElement<
  State,
  HTMLCanvasElement
> {
  private width = 0;
  private height = 0;
  private hide = true;
  private mousedownCoordinates?: Coordinates;
  private mousedown = false;
  private start: Coordinates = [0, 0];
  private wheelTimeout: ReturnType<typeof setTimeout> | null = null;
  private cursor: string;

  getEvents(config: Readonly<State["config"]>): Events<State> {
    if (config.thumbnail) return {};

    return {
      click: ({ event, update, dispatchEvent }) => {
        update({ showOptions: false }, (state, overlays, sample) => {
          if (
            state.config.thumbnail ||
            state.disableOverlays ||
            !state.options.showOverlays
          ) {
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
              dispatchEvent("select", {
                ...top.getSelectData(state),
                sampleId: sample.id,
              });
          }
        });
      },
      mouseleave: ({ dispatchEvent }) => {
        this.mousedown = false;
        dispatchEvent("tooltip", null);
      },
      mousemove: ({ event, update, dispatchEvent }) => {
        update((state) => {
          if (state.config.thumbnail) {
            return {};
          }
          const newState: Partial<State> = {
            cursorCoordinates: [
              (<MouseEvent>event).pageX,
              (<MouseEvent>event).pageY,
            ],
            rotate: 0,
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
        requestAnimationFrame(() => {
          update(
            ({
              config: { thumbnail },
              dimensions,
              pan: [px, py],
              scale,
              windowBBox: [tlx, tly, width, height],
              options: { zoomPad },
            }) => {
              if (thumbnail) {
                return {};
              }

              event.preventDefault();
              event.stopImmediatePropagation();

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
                update(
                  (state) => {
                    return {
                      wheeling: false,
                      disableOverlays: Boolean(state.playing || state.seeking),
                    };
                  },
                  (state, overlays) =>
                    dispatchTooltipEvent(dispatchEvent, state.disableOverlays)(
                      state,
                      overlays
                    )
                );
              }, 200);

              return {
                pan: [x - xs * newScale, y - ys * newScale],
                scale: newScale,
                cursorCoordinates: [
                  (<MouseEvent>event).pageX,
                  (<MouseEvent>event).pageY,
                ],
                wheeling: true,
                disableOverlays: true,
              };
            },
            dispatchTooltipEvent(dispatchEvent, true)
          );
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("canvas");
    element.classList.add(lookerCanvas, invisible);
    return element;
  }

  renderSelf({
    loaded,
    reloading,
    error,
    disabled,
    config: { thumbnail },
    panning,
    windowBBox,
    mouseIsOnOverlay,
    disableOverlays,
  }: Readonly<State>) {
    if (!windowBBox) {
      return this.element;
    }
    const [_, __, width, height] = windowBBox;
    if (this.width !== width) {
      const dpr = getDPR();
      this.element.width = width * dpr;
      this.width = width;
    }
    if (this.height !== height) {
      const dpr = getDPR();
      this.element.height = height * dpr;
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

    const hide = Boolean(!loaded || disabled || reloading || error);
    if (this.hide !== hide) {
      this.hide = hide;
      this.hide
        ? this.element.classList.add(invisible)
        : this.element.classList.remove(invisible);
    }
    return this.element;
  }

  private getPan([x, y]: Coordinates): Coordinates {
    const [sx, sy] = this.start;
    return [x - sx, y - sy];
  }
}
