import { useStreamValues } from "@fiftyone/playback";
import React, { useMemo } from "react";
import type {
  EpisodeRecordingFacts,
  PointCloudVisualization,
} from "../../../../ir";
import { MAX_POINT_CLOUD_RENDER_POINTS } from "../../../../runtime/point-cloud-render-payload";
import { useSceneSourcesByType } from "../../../../scene-inventory/react";
import { SCENE_SOURCE_TYPE } from "../../../../ir";
import {
  buildPointCloudSamplingNotice,
  buildRecordingNotices,
  useStabilizedNotices,
  type PointCloudSamplingSummary,
} from "../../status/health";
import { useSceneNotices } from "../../status/scene-notices-context";
import NoticeStrip from "../../status/NoticeStrip";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";

/**
 * Live display-sampling summary across every point-cloud source in the
 * scene, or null while all clouds render in full.
 */
export function usePointCloudSamplingSummary(): PointCloudSamplingSummary | null {
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const streamIds = useMemo(
    () => pointCloudSources.map((source) => source.id),
    [pointCloudSources],
  );
  const frames =
    useStreamValues<StreamPlaybackFrame<PointCloudVisualization> | null>(
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
 * The Scene tab's non-warning status strip: conditions the 3D tiles publish
 * (transform failures, placement loading, camera tracking) plus the sampling
 * condition detected here. Warning diagnostics are filtered by `NoticeStrip`
 * so they remain local to the affected panel.
 * Tile-published notices arrive already stabilized; the locally produced
 * sampling notice goes through its own stabilizer so both flavors share
 * the same appearance/disappearance discipline.
 */
export const SceneStatusStrip: React.FC<{
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly sampling: PointCloudSamplingSummary | null;
}> = ({ recordingFacts, sampling }) => {
  const publishedNotices = useSceneNotices();
  const producedLocally = useMemo(() => {
    const samplingNotice = buildPointCloudSamplingNotice(
      sampling,
      MAX_POINT_CLOUD_RENDER_POINTS,
    );
    return [
      ...buildRecordingNotices(recordingFacts),
      ...(samplingNotice ? [samplingNotice] : []),
    ];
  }, [recordingFacts, sampling]);
  const localNotices = useStabilizedNotices(producedLocally);
  const notices = useMemo(
    () => [...localNotices, ...publishedNotices],
    [localNotices, publishedNotices],
  );

  return <NoticeStrip notices={notices} />;
};
