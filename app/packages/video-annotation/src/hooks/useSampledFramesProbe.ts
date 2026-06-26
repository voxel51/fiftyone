import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useState } from "react";
import {
  useDatasetName,
  useGroupSlice,
  useModalSampleId,
  useView,
} from "../state/accessors";

export type SampledFramesState = "checking" | "sampled" | "unsampled";

export interface FramesProbeResponse {
  frames?: Array<{ frame_number: number; filepath?: string }>;
}

/** A `/frames` probe response counts as "sampled" iff frame 1 has a filepath. */
export const responseHasSampledFrames = (
  response: FramesProbeResponse,
): boolean => {
  const filepath = response?.frames?.[0]?.filepath;
  return typeof filepath === "string" && filepath.length > 0;
};

/**
 * Probe whether the open video's frames are materialized on disk. The ImaVid
 * annotate path renders one image per frame, so a video that hasn't been
 * `to_frames(sample_frames=True)`'d has no per-frame `filepath` and renders
 * blank. We POST a single-frame `/frames` request for frame 1 and treat a
 * non-empty `filepath` as "sampled".
 *
 * `enabled` gates the probe on upstream metadata being resolved (we need a
 * frame count first); while disabled or in-flight it reports "checking". A
 * probe error is treated as inconclusive — we report "sampled" so a transient
 * failure doesn't wrongly block annotation; the stream's own failed-frame
 * handling covers genuinely missing media.
 */
export const useSampledFramesProbe = (
  frameCount: number | undefined,
  enabled: boolean,
): SampledFramesState => {
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const sampleId = useModalSampleId();

  const [state, setState] = useState<SampledFramesState>("checking");

  // `view` is a fresh array each render when no view is applied, so key the
  // effect off its serialized value — depending on the array identity would
  // re-run the probe (and re-fetch) on every render.
  const viewKey = JSON.stringify(view);

  useEffect(() => {
    if (!enabled || !sampleId || !dataset || !frameCount) {
      setState("checking");
      return undefined;
    }

    let cancelled = false;
    setState("checking");

    const probe = async () => {
      try {
        const response = (await getFetchFunction()("POST", "/frames", {
          sampleId,
          dataset,
          view,
          frameNumber: 1,
          numFrames: 1,
          frameCount,
          slice: slice ?? undefined,
          fields: ["filepath"],
        })) as FramesProbeResponse;

        if (cancelled) {
          return;
        }

        setState(responseHasSampledFrames(response) ? "sampled" : "unsampled");
      } catch {
        if (!cancelled) {
          setState("sampled");
        }
      }
    };

    probe();

    return () => {
      cancelled = true;
    };
    // `view` is intentionally tracked via `viewKey` (stable by value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sampleId, dataset, slice, frameCount, viewKey]);

  return state;
};
