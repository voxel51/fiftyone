/**
 * Browser-side SAM2 video propagation using the ONNX memory pipeline:
 * memory_encoder + memory_attention + image_decoder_video.
 *
 * Unlike the centroid-chain strategy in videoPropagation.ts, this runs the
 * full SAM2 video predictor in the worker: temporal memory conditions each
 * frame's features before decoding, so tracking is robust to occlusion and
 * scale change without re-prompting.
 */

import { objectId } from "@fiftyone/utilities";
import type { BrowserAnnotationProvider } from "./BrowserAnnotationProvider";
import type { InferenceResult, PromptPoint } from "./types";

const SAM2_VIDEO_PERF_LOG = true;

export interface VideoSam2BrowserOptions {
  getFrameBitmap: (frameIdx: number) => Promise<ImageBitmap>;
  /** First frame index to track (inclusive). */
  seedFrameIdx: number;
  /** Last frame index to track (inclusive). */
  endFrameIdx: number;
  /** Prompt points on the seed frame (normalised [0, 1]). */
  seedPoints: PromptPoint[];
  /** Stable per-video id; used to build a unique session id. */
  videoKey: string;
  /** Called for every frame in [seedFrameIdx, endFrameIdx]. */
  onFrame?: (frameIdx: number, result: InferenceResult) => void;
  onProgress?: (done: number, total: number) => void;
  shouldAbort?: () => boolean;
}

/**
 * Run SAM2 video propagation in the browser worker. Loads video models if not
 * already loaded, creates a session, propagates from seed to end, then
 * disposes the session.
 */
export async function propagateSam2VideoBrowser(
  provider: BrowserAnnotationProvider,
  options: VideoSam2BrowserOptions
): Promise<Map<number, InferenceResult>> {
  const {
    getFrameBitmap,
    seedFrameIdx,
    endFrameIdx,
    seedPoints,
    videoKey,
    onFrame,
    onProgress,
    shouldAbort,
  } = options;

  if (seedFrameIdx >= endFrameIdx)
    throw new Error("seedFrameIdx must be less than endFrameIdx");

  // Lazily load video models (no-op if already loaded)
  await provider.loadVideoModel();

  const sessionId = `${videoKey}#${objectId()}`;
  const results = new Map<number, InferenceResult>();
  const total = endFrameIdx - seedFrameIdx + 1;
  const runStart = SAM2_VIDEO_PERF_LOG ? performance.now() : 0;

  try {
    // Seed frame: init session (encodes + decodes + memory-encodes)
    const seedBitmap = await getFrameBitmap(seedFrameIdx);
    await provider.initVideoSession(sessionId, seedBitmap, seedPoints);
    onProgress?.(1, total);

    // Propagate through remaining frames
    let done = 1;
    for (let frameIdx = seedFrameIdx + 1; frameIdx <= endFrameIdx; frameIdx++) {
      if (shouldAbort?.()) break;

      const bitmap = await getFrameBitmap(frameIdx);
      const result = await provider.propagateVideoFrame(sessionId, bitmap);

      results.set(frameIdx, result);
      onFrame?.(frameIdx, result);
      done++;
      onProgress?.(done, total);
    }
  } finally {
    await provider.endVideoSession(sessionId).catch(() => {});
  }

  if (SAM2_VIDEO_PERF_LOG && results.size > 0) {
    const wall = performance.now() - runStart;
    // eslint-disable-next-line no-console
    console.debug(
      `[sam2-perf] video-browser frames=${results.size} wall=${wall.toFixed(
        0
      )}ms (${(wall / results.size).toFixed(1)}ms/frame)`
    );
  }

  return results;
}
