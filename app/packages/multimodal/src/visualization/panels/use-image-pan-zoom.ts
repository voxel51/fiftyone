import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clampImageViewTransform,
  DEFAULT_IMAGE_VIEW_TRANSFORM,
  imageViewTransformEquals,
  type ImageDisplaySize,
  type ImageViewTransform,
} from "./base-2d-scene";

const MAX_IMAGE_VIEW_SCALE = 16;
const MIN_IMAGE_VIEW_SCALE = 0.1;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_DELTA_PX = 16;
const WHEEL_PAGE_DELTA_PX = 800;
const WHEEL_ZOOM_FACTOR = 1.045;

interface DragState {
  readonly lastX: number;
  readonly lastY: number;
  readonly pointerId: number;
}

interface UseImagePanZoomOptions {
  readonly enabled?: boolean;
  readonly fit: "contain" | "cover";
  readonly imageSize: ImageDisplaySize | null;
  readonly resetKey?: string;
}

type ImageViewTransformUpdater =
  | ImageViewTransform
  | ((current: ImageViewTransform) => ImageViewTransform);

export function useImagePanZoom({
  enabled = true,
  fit,
  imageSize,
  resetKey,
}: UseImagePanZoomOptions) {
  const canInteractRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const updateViewTransformRef = useRef<
    (updater: ImageViewTransformUpdater) => void
  >(() => undefined);
  const [containerSize, setContainerSize] = useState<ImageDisplaySize | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [surfaceElement, setSurfaceElement] = useState<HTMLDivElement | null>(
    null
  );
  const [viewTransform, setViewTransform] = useState<ImageViewTransform>(
    DEFAULT_IMAGE_VIEW_TRANSFORM
  );
  const canInteract =
    enabled &&
    Boolean(
      containerSize &&
        imageSize &&
        containerSize.width > 0 &&
        containerSize.height > 0 &&
        imageSize.width > 0 &&
        imageSize.height > 0
    );

  const setSurfaceRef = useCallback((element: HTMLDivElement | null) => {
    setSurfaceElement(element);
  }, []);

  const clampTransform = useCallback(
    (transform: ImageViewTransform) =>
      clampImageViewTransform(transform, {
        containerSize,
        fit,
        imageSize,
        maxScale: MAX_IMAGE_VIEW_SCALE,
        minScale: MIN_IMAGE_VIEW_SCALE,
      }),
    [containerSize, fit, imageSize]
  );

  const updateViewTransform = useCallback(
    (updater: ImageViewTransformUpdater) => {
      setViewTransform((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        const clamped = clampTransform(next);
        return imageViewTransformEquals(current, clamped) ? current : clamped;
      });
    },
    [clampTransform]
  );

  const resetView = useCallback(() => {
    setViewTransform(DEFAULT_IMAGE_VIEW_TRANSFORM);
  }, []);

  useEffect(() => {
    canInteractRef.current = canInteract;
  }, [canInteract]);

  useEffect(() => {
    updateViewTransformRef.current = updateViewTransform;
  }, [updateViewTransform]);

  useEffect(() => {
    if (!surfaceElement) {
      setContainerSize(null);
      return undefined;
    }

    const readSize = () => {
      const rect = surfaceElement.getBoundingClientRect();
      setContainerSize({ height: rect.height, width: rect.width });
    };

    readSize();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { height, width } = entry.contentRect;
      setContainerSize({ height, width });
    });
    observer.observe(surfaceElement);

    return () => observer.disconnect();
  }, [surfaceElement]);

  useEffect(() => {
    if (!enabled || !surfaceElement) {
      return undefined;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!canInteractRef.current) {
        return;
      }

      const deltaY = wheelDeltaPixels(event);
      if (deltaY === 0) {
        return;
      }

      const rect = surfaceElement.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };

      updateViewTransformRef.current((current) => {
        return nextImageViewTransformForWheel(current, deltaY, pointer);
      });
    };

    // Keep pinch/ctrl-wheel zoom inside the panel instead of the browser.
    surfaceElement.addEventListener("wheel", onWheel, { passive: false });
    return () => surfaceElement.removeEventListener("wheel", onWheel);
  }, [enabled, surfaceElement]);

  useEffect(() => {
    updateViewTransform((current) => current);
  }, [updateViewTransform]);

  useEffect(() => {
    resetView();
  }, [resetKey, resetView]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canInteract || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = {
        lastX: event.clientX,
        lastY: event.clientY,
        pointerId: event.pointerId,
      };
      setIsDragging(true);
    },
    [canInteract]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - drag.lastX;
      const deltaY = event.clientY - drag.lastY;
      dragRef.current = {
        lastX: event.clientX,
        lastY: event.clientY,
        pointerId: event.pointerId,
      };

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      event.preventDefault();
      updateViewTransform((current) => ({
        ...current,
        translateX: current.translateX + deltaX,
        translateY: current.translateY + deltaY,
      }));
    },
    [updateViewTransform]
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const surfaceStyle = useMemo<CSSProperties>(
    () => ({
      cursor: canInteract ? (isDragging ? "grabbing" : "grab") : undefined,
      overscrollBehavior: enabled ? "contain" : undefined,
      touchAction: enabled ? "none" : undefined,
    }),
    [canInteract, enabled, isDragging]
  );

  return {
    isDragging,
    onPointerCancel: endDrag,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    resetView,
    surfaceRef: setSurfaceRef,
    surfaceStyle,
    viewTransform,
  };
}

export function nextImageViewTransformForWheel(
  current: ImageViewTransform,
  deltaY: number,
  pointer: { readonly x: number; readonly y: number }
): ImageViewTransform {
  if (deltaY === 0) {
    return current;
  }

  const nextScale = clampScale(
    deltaY < 0
      ? current.scale * WHEEL_ZOOM_FACTOR
      : current.scale / WHEEL_ZOOM_FACTOR
  );

  return zoomAtPoint(current, nextScale, pointer);
}

function wheelDeltaPixels(event: WheelEvent): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_DELTA_PX;
  }

  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * WHEEL_PAGE_DELTA_PX;
  }

  return event.deltaY;
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return MIN_IMAGE_VIEW_SCALE;
  }

  if (scale <= MIN_IMAGE_VIEW_SCALE) {
    return MIN_IMAGE_VIEW_SCALE;
  }

  if (scale >= MAX_IMAGE_VIEW_SCALE) {
    return MAX_IMAGE_VIEW_SCALE;
  }

  return scale;
}

function zoomAtPoint(
  current: ImageViewTransform,
  nextScale: number,
  pointer: { readonly x: number; readonly y: number }
): ImageViewTransform {
  const ratio = nextScale / Math.max(MIN_IMAGE_VIEW_SCALE, current.scale);

  return {
    scale: nextScale,
    translateX: pointer.x - (pointer.x - current.translateX) * ratio,
    translateY: pointer.y - (pointer.y - current.translateY) * ratio,
  };
}
