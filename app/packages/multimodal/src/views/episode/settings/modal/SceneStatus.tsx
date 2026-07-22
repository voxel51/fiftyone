import { useStreamValues } from "@fiftyone/playback";
import React, { useMemo } from "react";
import {
  MAX_POINT_CLOUD_RENDER_POINTS,
  type PointCloudVisualization,
} from "../../../../ir";
import { useSceneSourcesByType } from "../../../../scene-inventory/react";
import { SCENE_SOURCE_TYPE } from "../../../../ir";
import {
  buildPointCloudSamplingNotice,
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
 * The Scene tab's status strip: every scene-scoped health notice in one
 * place — conditions the 3D tiles publish (transform failures, placement
 * loading, camera tracking) plus the sampling condition detected here.
 * Tile-published notices arrive already stabilized; the locally produced
 * sampling notice goes through its own stabilizer so both flavors share
 * the same appearance/disappearance discipline.
 */
export const SceneStatusStrip: React.FC<{
  readonly sampling: PointCloudSamplingSummary | null;
}> = ({ sampling }) => {
  const publishedNotices = useSceneNotices();
  const producedLocally = useMemo(() => {
    const samplingNotice = buildPointCloudSamplingNotice(
      sampling,
      MAX_POINT_CLOUD_RENDER_POINTS,
    );
    return samplingNotice ? [samplingNotice] : [];
  }, [sampling]);
  const localNotices = useStabilizedNotices(producedLocally);
  const notices = useMemo(
    () => [...localNotices, ...publishedNotices],
    [localNotices, publishedNotices],
  );

  return <NoticeStrip notices={notices} />;
};
