import type uPlot from "uplot";

export const TIMESERIES_ZOOM_IN_FACTOR = 0.8;
export const TIMESERIES_ZOOM_OUT_FACTOR = 1 / TIMESERIES_ZOOM_IN_FACTOR;

type Range = readonly [min: number, max: number];

interface TouchPosition {
  readonly distance: number;
  readonly x: number;
  readonly y: number;
}

interface TouchZoomPanPluginOptions {
  readonly onInteraction?: () => void;
  readonly xLimits: Range;
}

/**
 * Zooms both chart axes around their current midpoint. The x range is
 * constrained to the recording while y remains free so signal offsets can be
 * inspected without losing the time domain.
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
  const yRange = scaledRange(chart.scales.y, factor);
  if (!xRange && !yRange) {
    return;
  }

  chart.batch(() => {
    if (xRange) {
      chart.setScale("x", { min: xRange[0], max: xRange[1] });
    }
    if (yRange) {
      chart.setScale("y", { min: yRange[0], max: yRange[1] });
    }
  });
}

/**
 * uPlot touch plugin based on its pinch-zoom demo. One finger pans and two
 * fingers pinch uniformly across x/y. Gesture state and document listeners
 * stay outside React so move-frequency work never causes component renders.
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
        let initialYRange = 0;
        let rect: DOMRect | null = null;
        let xAnchor = 0;
        let yAnchor = 0;
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

          const ySize = initialYRange * factor;
          const bottomFraction = 1 - currentPosition.y / rect.height;
          const yMin = yAnchor - bottomFraction * ySize;

          chart.batch(() => {
            chart.setScale("x", {
              min: nextXRange[0],
              max: nextXRange[1],
            });
            chart.setScale("y", { min: yMin, max: yMin + ySize });
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
          const yScale = finiteScaleRange(chart.scales.y);
          if (!position || !xScale || !yScale) {
            return;
          }

          initialPosition = position;
          currentPosition = position;
          initialXRange = xScale[1] - xScale[0];
          initialYRange = yScale[1] - yScale[0];
          xAnchor = chart.posToVal(position.x, "x");
          yAnchor = chart.posToVal(position.y, "y");

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
  const firstY = first.clientY - rect.top;
  if (touches.length === 1) {
    return { distance: 1, x: firstX, y: firstY };
  }

  const second = touches[1];
  const secondX = second.clientX - rect.left;
  const secondY = second.clientY - rect.top;
  const deltaX = secondX - firstX;
  const deltaY = secondY - firstY;

  return {
    distance: Math.max(Math.hypot(deltaX, deltaY), Number.EPSILON),
    x: (firstX + secondX) / 2,
    y: (firstY + secondY) / 2,
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
