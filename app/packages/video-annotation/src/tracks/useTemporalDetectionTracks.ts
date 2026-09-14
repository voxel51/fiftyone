/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Track } from "@fiftyone/playback";
import type { ModalSample } from "@fiftyone/state";
import { useMemo } from "react";
import {
  useModalSampleFrameRate,
  useVisibleLabelSchemas,
} from "../state/accessors";
import { useEngineTemporalSample } from "../sync/useTemporalOverlaySync";
import {
  buildTemporalDetectionTracks,
  type TemporalDetectionLabelLike,
} from "./temporalDetectionTracks";

/** Resolves the row color for a temporal-detection track. */
export type TemporalDetectionColorResolver = (
  path: string,
  label: TemporalDetectionLabelLike,
) => string;

/**
 * Derive TD tracks from the engine — the authoritative, reactive TD source.
 * Reading it directly means a `support` / label edit (sidebar or timeline drag)
 * rebuilds the rows immediately. The prior scene-overlay read only re-derived on
 * an overlay add/remove, so an in-place support edit left the timeline stale;
 * `useTemporalOverlaySync` keeps the canvas overlays in step from the same source.
 */
export function useTemporalDetectionTracks(
  sample: ModalSample | undefined,
  resolveColor: TemporalDetectionColorResolver,
  /**
   * Explore's active TD field set. Same override, same reason, as
   * {@link useTemporalOverlaySync}'s: `useVisibleLabelSchemas()` stays empty
   * in an Explore-only session, which without this dropped every TD row from
   * the timeline exactly as it dropped every TD box from the canvas.
   */
  exploreVisible?: ReadonlySet<string>,
): Track[] {
  const temporalSample = useEngineTemporalSample();
  // An image dynamic group has no per-sample rate; the accessor falls back to
  // the dataset's target rate so those rows are not dropped.
  const frameRate = useModalSampleFrameRate(sample);
  const annotationVisible = useVisibleLabelSchemas();
  const visible = exploreVisible ?? annotationVisible;

  return useMemo(() => {
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
      return [];
    }

    // Only fields visible in the sidebar — a deactivated TD field drops its
    // timeline rows, matching the canvas + sidebar.
    const visibleSample: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(temporalSample)) {
      if (visible.has(path)) {
        visibleSample[path] = value;
      }
    }

    return buildTemporalDetectionTracks({
      sample: visibleSample,
      fps: frameRate,
      resolveColor,
    });
  }, [temporalSample, frameRate, resolveColor, visible]);
}
