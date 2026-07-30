import { useMemo } from "react";

import type { SceneUpdateVisualization } from "../../../ir";
import type { ImageAnnotationSetInput } from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import type { CameraModel } from "../spatial/camera-geometry/camera-model";
import { useFrameTransformsContext } from "../spatial/frame-transforms/context";
import { useStreamPlaybackFrames } from "../playback/use-stream-values";
import { useInterpolatedSceneUpdateFrames } from "../scene/entities/use-interpolated-scene-updates";
import { projectSceneAnnotationsToImage } from "./project-scene-annotations";

const EMPTY_STREAMS: readonly string[] = [];

/** Enabled 3D cuboid overlays prepared for one image tile. */
interface ProjectedSceneAnnotations {
  readonly sets: readonly ImageAnnotationSetInput[];
}

/**
 * Subscribes to scene annotations only while camera geometry is available,
 * resolves SceneUpdate lifecycle state, and projects cuboids into image space.
 */
export function useProjectedSceneAnnotations({
  cameraFrameId,
  cameraModel,
  imageContentTimeNs,
  interpolate,
  outputHeight,
  outputWidth,
  streams,
}: {
  readonly cameraFrameId: string | null | undefined;
  readonly cameraModel: CameraModel | null;
  readonly imageContentTimeNs: bigint | null | undefined;
  readonly interpolate: boolean;
  readonly outputHeight: number | null | undefined;
  readonly outputWidth: number | null | undefined;
  readonly streams: readonly string[];
}): ProjectedSceneAnnotations {
  const active =
    Boolean(cameraFrameId && cameraModel) &&
    imageContentTimeNs !== null &&
    imageContentTimeNs !== undefined &&
    Number.isFinite(outputWidth) &&
    Number.isFinite(outputHeight) &&
    (outputWidth ?? 0) > 0 &&
    (outputHeight ?? 0) > 0;
  const activeStreams = active ? streams : EMPTY_STREAMS;
  const heldFrames =
    useStreamPlaybackFrames<SceneUpdateVisualization>(activeStreams);
  // The image timestamp owns both recorded lifecycle sampling and optional
  // interpolation, so held pixels never receive playhead-driven geometry.
  const frames = useInterpolatedSceneUpdateFrames({
    frames: heldFrames,
    interpolate,
    surface: "modal-image",
    streams: activeStreams,
    targetTimeNs: imageContentTimeNs ?? undefined,
  });
  const { resolve } = useFrameTransformsContext();

  const sets = useMemo(() => {
    if (
      !cameraFrameId ||
      !cameraModel ||
      imageContentTimeNs === null ||
      imageContentTimeNs === undefined ||
      !outputWidth ||
      !outputHeight
    ) {
      return [];
    }
    const projected: ImageAnnotationSetInput[] = [];
    for (let index = 0; index < activeStreams.length; index++) {
      const playbackFrame = frames[index];
      const stream = activeStreams[index];
      if (!playbackFrame || !stream) {
        continue;
      }
      const set = projectSceneAnnotationsToImage({
        cameraFrameId,
        cameraModel,
        imageContentTimeNs,
        outputHeight,
        outputWidth,
        playbackFrame,
        resolve,
        stream,
      });
      if (set) {
        projected.push(set);
      }
    }
    return projected;
  }, [
    cameraFrameId,
    cameraModel,
    frames,
    imageContentTimeNs,
    outputHeight,
    outputWidth,
    resolve,
    activeStreams,
  ]);

  return useMemo(() => ({ sets }), [sets]);
}
