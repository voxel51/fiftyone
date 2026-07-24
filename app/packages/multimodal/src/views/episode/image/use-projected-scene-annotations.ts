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
  outputHeight,
  outputWidth,
  streams,
}: {
  readonly cameraFrameId: string | null | undefined;
  readonly cameraModel: CameraModel | null;
  readonly outputHeight: number | null | undefined;
  readonly outputWidth: number | null | undefined;
  readonly streams: readonly string[];
}): ProjectedSceneAnnotations {
  const active =
    Boolean(cameraFrameId && cameraModel) &&
    Number.isFinite(outputWidth) &&
    Number.isFinite(outputHeight) &&
    (outputWidth ?? 0) > 0 &&
    (outputHeight ?? 0) > 0;
  const activeStreams = active ? streams : EMPTY_STREAMS;
  const heldFrames =
    useStreamPlaybackFrames<SceneUpdateVisualization>(activeStreams);
  // Even without smoothing, this resolves SceneUpdate deltas into the active
  // lifecycle snapshot so persistent entities do not disappear between msgs.
  const frames = useInterpolatedSceneUpdateFrames({
    frames: heldFrames,
    interpolate: false,
    streams: activeStreams,
  });
  const { resolve } = useFrameTransformsContext();

  const sets = useMemo(() => {
    if (!cameraFrameId || !cameraModel || !outputWidth || !outputHeight) {
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
    outputHeight,
    outputWidth,
    resolve,
    activeStreams,
  ]);

  return useMemo(() => ({ sets }), [sets]);
}
