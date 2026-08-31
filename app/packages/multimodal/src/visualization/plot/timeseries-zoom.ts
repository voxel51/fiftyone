import type uPlot from "uplot";

export const TIMESERIES_ZOOM_IN_FACTOR = 0.8;
export const TIMESERIES_ZOOM_OUT_FACTOR = 1 / TIMESERIES_ZOOM_IN_FACTOR;

type Range = readonly [min: number, max: number];

interface TouchPosition {
  readonly distance: number;
  readonly x: number;
}

interface TouchZoomPanPluginOptions {
  readonly onInteraction?: () => void;
  readonly xLimits: Range;
}

/**
 * Zooms the time axis around its current midpoint, constrained to the
 * recording. The chart independently auto-fits y to the resulting viewport.
 */
export function zoomTimeseriesChart(
  chart: uPlot,
  factor: number,
  xLimits: Range,
): void {
  if (!Number.isFinite(factor) || factor <= 0) {
    return;
  }

  const xRange = scaledRange(chart.scales.x, factor, xLimits);
  if (!xRange) return;
  chart.batch(() => {
    chart.setScale("x", { min: xRange[0], max: xRange[1] });
  });
}

/**
 * uPlot touch plugin based on its pinch-zoom demo. One finger pans and two
 * fingers pinch the time axis only. Gesture state and document listeners stay
 * outside React so move-frequency work never causes component renders.
 */
export function touchZoomPanPlugin({
  onInteraction,
  xLimits,
}: TouchZoomPanPluginOptions): uPlot.Plugin {
  let destroyInteraction: (() => void) | undefined;

  return {
    hooks: {
      destroy: () => {
        destroyInteraction?.();
        destroyInteraction = undefined;
      },
      init: (chart) => {
        const over = chart.over;
        let frame: number | null = null;
        let initialPosition: TouchPosition | null = null;
        let currentPosition: TouchPosition | null = null;
        let initialXRange = 0;
        let rect: DOMRect | null = null;
        let xAnchor = 0;
        let tracking = false;

        const stopTracking = () => {
          if (!tracking) {
            return;
          }
          tracking = false;
          document.removeEventListener("touchmove", handleTouchMove);
          document.removeEventListener("touchend", handleTouchEnd);
          document.removeEventListener("touchcancel", handleTouchCancel);
        };

        const applyGesture = () => {
          frame = null;
          if (!rect || !initialPosition || !currentPosition) {
            return;
          }

          const factor = initialPosition.distance / currentPosition.distance;
          if (!Number.isFinite(factor) || factor <= 0) {
            return;
          }

          const xSize = initialXRange * factor;
          const xMin = xAnchor - (currentPosition.x / rect.width) * xSize;
          const nextXRange = clampRange([xMin, xMin + xSize], xLimits);
          chart.batch(() => {
            chart.setScale("x", {
              min: nextXRange[0],
              max: nextXRange[1],
            });
          });
          onInteraction?.();
        };

        const beginGesture = (event: TouchEvent) => {
          rect = over.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return;
          }

          const position = touchPosition(event.touches, rect);
          const xScale = finiteScaleRange(chart.scales.x);
          if (!position || !xScale) {
            return;
          }

          initialPosition = position;
          currentPosition = position;
          initialXRange = xScale[1] - xScale[0];
          xAnchor = chart.posToVal(position.x, "x");

          if (!tracking) {
            tracking = true;
            document.addEventListener("touchmove", handleTouchMove, {
              passive: true,
            });
            document.addEventListener("touchend", handleTouchEnd, {
              passive: true,
            });
            document.addEventListener("touchcancel", handleTouchCancel, {
              passive: true,
            });
          }
        };

        function handleTouchMove(event: TouchEvent) {
          if (!rect) {
            return;
          }
          const position = touchPosition(event.touches, rect);
          if (!position) {
            return;
          }
          currentPosition = position;
          if (frame === null) {
            frame = window.requestAnimationFrame(applyGesture);
          }
        }

        function handleTouchEnd(event: TouchEvent) {
          if (frame !== null) {
            window.cancelAnimationFrame(frame);
            applyGesture();
          }
          if (event.touches.length > 0) {
            beginGesture(event);
          } else {
            stopTracking();
          }
        }

        function handleTouchCancel() {
          if (frame !== null) {
            window.cancelAnimationFrame(frame);
            frame = null;
          }
          stopTracking();
        }

        over.addEventListener("touchstart", beginGesture, { passive: true });

        destroyInteraction = () => {
          if (frame !== null) {
            window.cancelAnimationFrame(frame);
            frame = null;
          }
          stopTracking();
          over.removeEventListener("touchstart", beginGesture);
        };
      },
    },
  };
}

function touchPosition(
  touches: TouchList,
  rect: DOMRect,
): TouchPosition | null {
  if (touches.length === 0) {
    return null;
  }

  const first = touches[0];
  const firstX = first.clientX - rect.left;
  if (touches.length === 1) {
    return { distance: 1, x: firstX };
  }

  const second = touches[1];
  const secondX = second.clientX - rect.left;
  const firstY = first.clientY - rect.top;
  const secondY = second.clientY - rect.top;
  const deltaX = secondX - firstX;
  const deltaY = secondY - firstY;

  return {
    distance: Math.max(Math.hypot(deltaX, deltaY), Number.EPSILON),
    x: (firstX + secondX) / 2,
  };
}

function scaledRange(
  scale: uPlot.Scale | undefined,
  factor: number,
  limits?: Range,
): Range | null {
  const range = finiteScaleRange(scale);
  if (!range) {
    return null;
  }
  const midpoint = (range[0] + range[1]) / 2;
  const halfSize = ((range[1] - range[0]) * factor) / 2;
  const scaled: Range = [midpoint - halfSize, midpoint + halfSize];
  return limits ? clampRange(scaled, limits) : scaled;
}

function finiteScaleRange(scale: uPlot.Scale | undefined): Range | null {
  const min = scale?.min;
  const max = scale?.max;
  if (
    min === undefined ||
    max === undefined ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min >= max
  ) {
    return null;
  }
  return [min, max];
}

function clampRange(range: Range, limits: Range): Range {
  const limitSize = limits[1] - limits[0];
  const rangeSize = range[1] - range[0];
  if (rangeSize >= limitSize) {
    return limits;
  }
  if (range[0] < limits[0]) {
    return [limits[0], limits[0] + rangeSize];
  }
  if (range[1] > limits[1]) {
    return [limits[1] - rangeSize, limits[1]];
  }
  return range;
}
