import { useCallback, useEffect, useRef, type CSSProperties } from "react";

import type { RawImageVisualization } from "../../../ir";
import {
  imageDisplayRect,
  transformedImageDisplayRect,
  type ImageViewTransform,
} from "../../../visualization/media-2d/base-2d-scene";
import type { EpisodeCameraModel } from "../spatial/camera-geometry/episode-camera-model";
import {
  episodeDepthSampleAtDisplayPixel,
  useSetEpisodeDepthHover,
  type EpisodeDepthHover,
} from "../spatial/depth-sampling";

interface PointerPosition {
  readonly clientX: number;
  readonly clientY: number;
}

interface DepthHoverInputs {
  readonly cameraFrameId: string;
  readonly contentTimeNs: bigint;
  readonly displayCameraModel: EpisodeCameraModel;
  readonly fit: "contain" | "cover";
  readonly frame: RawImageVisualization;
  readonly imageStream: string;
  readonly sourceCameraModel: EpisodeCameraModel;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * Nonvisual interaction layer that publishes the depth sample under the image
 * pointer. Sampling follows display fit, pan/zoom, and rectification while
 * updates are limited to one per animation frame.
 */
export default function EpisodeDepthHoverOverlay(inputs: DepthHoverInputs) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const lastPointerRef = useRef<PointerPosition | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const publishedRef = useRef<EpisodeDepthHover | null>(null);
  const setDepthHover = useSetEpisodeDepthHover();

  const clearPublished = useCallback(() => {
    const published = publishedRef.current;
    if (!published) return;
    publishedRef.current = null;
    setDepthHover((current) => (current === published ? null : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Jotai setter is stable
  }, []);

  const publishAtPointer = useCallback(() => {
    animationFrameRef.current = null;
    const pointer = lastPointerRef.current;
    const surface = containerRef.current?.parentElement;
    if (!pointer || !surface) {
      clearPublished();
      return;
    }

    const bounds = surface.getBoundingClientRect();
    const current = inputsRef.current;
    if (bounds.width <= 0 || bounds.height <= 0) {
      clearPublished();
      return;
    }
    const rect = transformedImageDisplayRect(
      imageDisplayRect(
        { height: bounds.height, width: bounds.width },
        {
          height: current.displayCameraModel.height,
          width: current.displayCameraModel.width,
        },
        current.fit,
      ),
      current.viewTransform,
    );
    const x = pointer.clientX - bounds.left;
    const y = pointer.clientY - bounds.top;
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      x < rect.x ||
      y < rect.y ||
      x > rect.x + rect.width ||
      y > rect.y + rect.height
    ) {
      clearPublished();
      return;
    }

    const sample = episodeDepthSampleAtDisplayPixel({
      displayCameraModel: current.displayCameraModel,
      frame: current.frame,
      sourceCameraModel: current.sourceCameraModel,
      u:
        ((x - rect.x) / rect.width) *
        Math.max(0, current.displayCameraModel.width - 1),
      v:
        ((y - rect.y) / rect.height) *
        Math.max(0, current.displayCameraModel.height - 1),
    });
    if (!sample) {
      clearPublished();
      return;
    }

    const previous = publishedRef.current;
    if (
      previous?.contentTimeNs === current.contentTimeNs &&
      previous.imageStream === current.imageStream &&
      previous.pixel[0] === sample.pixel[0] &&
      previous.pixel[1] === sample.pixel[1]
    ) {
      return;
    }
    const hover: EpisodeDepthHover = {
      ...sample,
      cameraFrameId: current.cameraFrameId,
      contentTimeNs: current.contentTimeNs,
      imageStream: current.imageStream,
    };
    publishedRef.current = hover;
    setDepthHover(hover);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Jotai setter is stable
  }, [clearPublished]);

  const schedulePublish = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = requestAnimationFrame(publishAtPointer);
  }, [publishAtPointer]);

  // This effect binds pointer tracking to the shared image interaction surface.
  useEffect(() => {
    const surface = containerRef.current?.parentElement;
    if (!surface) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      lastPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      schedulePublish();
    };
    const handlePointerEnd = () => {
      lastPointerRef.current = null;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      clearPublished();
    };
    surface.addEventListener("pointercancel", handlePointerEnd);
    surface.addEventListener("pointerleave", handlePointerEnd);
    surface.addEventListener("pointermove", handlePointerMove);
    return () => {
      surface.removeEventListener("pointercancel", handlePointerEnd);
      surface.removeEventListener("pointerleave", handlePointerEnd);
      surface.removeEventListener("pointermove", handlePointerMove);
      handlePointerEnd();
    };
  }, [clearPublished, schedulePublish]);

  // This effect resamples a stationary pointer when playback or geometry moves.
  useEffect(() => {
    if (lastPointerRef.current) schedulePublish();
  }, [
    inputs.cameraFrameId,
    inputs.contentTimeNs,
    inputs.displayCameraModel,
    inputs.fit,
    inputs.frame,
    inputs.imageStream,
    inputs.sourceCameraModel,
    inputs.viewTransform,
    schedulePublish,
  ]);

  return (
    <div data-episode-depth-hover-overlay ref={containerRef} style={style} />
  );
}

const style: CSSProperties = {
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
};
