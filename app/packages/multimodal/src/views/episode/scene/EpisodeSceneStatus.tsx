import { useStreamValues } from "@fiftyone/playback";
import React, { useMemo } from "react";
import {
  MAX_POINT_CLOUD_RENDER_POINTS,
  type PointCloudVisualization,
} from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import {
  buildEpisodePointCloudSamplingNotice,
  useStabilizedEpisodeNotices,
  type EpisodePointCloudSamplingSummary,
} from "../shared/episode-health";
import { useEpisodeSceneNotices } from "./episode-scene-notices-context";
import EpisodeNoticeStrip from "../shared/EpisodeNoticeStrip";
import type { EpisodeStreamPlaybackFrame } from "../playback/use-episode-stream-values";

/**
 * Live display-sampling summary across every point-cloud source in the
 * scene, or null while all clouds render in full.
 */
export function usePointCloudSamplingSummary(): EpisodePointCloudSamplingSummary | null {
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const streamIds = useMemo(
    () => pointCloudSources.map((source) => source.id),
    [pointCloudSources],
  );
  const frames =
    useStreamValues<EpisodeStreamPlaybackFrame<PointCloudVisualization> | null>(
      streamIds,
    );

  let sampledCloudCount = 0;
  let largestFinitePointCount = 0;
  for (const playbackFrame of frames) {
    const payload = playbackFrame?.frame.renderPayload;
    if (!payload || payload.finitePointCount <= payload.sampledPointCount) {
      continue;
    }
    sampledCloudCount++;
    largestFinitePointCount = Math.max(
      largestFinitePointCount,
      payload.finitePointCount,
    );
  }

  return sampledCloudCount > 0
    ? { largestFinitePointCount, sampledCloudCount }
    : null;
}

/**
 * The Scene tab's status strip: every scene-scoped health notice in one
 * place — conditions the 3D tiles publish (transform failures, placement
 * loading, camera tracking) plus the sampling condition detected here.
 * Tile-published notices arrive already stabilized; the locally produced
 * sampling notice goes through its own stabilizer so both flavors share
 * the same appearance/disappearance discipline.
 */
export const EpisodeSceneStatusStrip: React.FC<{
  readonly sampling: EpisodePointCloudSamplingSummary | null;
}> = ({ sampling }) => {
  const publishedNotices = useEpisodeSceneNotices();
  const producedLocally = useMemo(() => {
    const samplingNotice = buildEpisodePointCloudSamplingNotice(
      sampling,
      MAX_POINT_CLOUD_RENDER_POINTS,
    );
    return samplingNotice ? [samplingNotice] : [];
  }, [sampling]);
  const localNotices = useStabilizedEpisodeNotices(producedLocally);
  const notices = useMemo(
    () => [...localNotices, ...publishedNotices],
    [localNotices, publishedNotices],
  );

  return <EpisodeNoticeStrip notices={notices} />;
};
