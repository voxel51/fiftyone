import { useStreamValues } from "@fiftyone/playback";
import React, { useMemo } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { MAX_POINT_CLOUD_RENDER_POINTS } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory/SceneInventoryProvider";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  buildMcapPointCloudSamplingNotice,
  useStabilizedMcapNotices,
  type McapPointCloudSamplingSummary,
} from "./mcap-health";
import { useMcapSceneNotices } from "./mcap-scene-notices-context";
import McapNoticeStrip from "./McapNoticeStrip";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

/**
 * Live display-sampling summary across every point-cloud source in the
 * scene, or null while all clouds render in full.
 */
export function usePointCloudSamplingSummary(): McapPointCloudSamplingSummary | null {
  const pointCloudSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const topicIds = useMemo(
    () => pointCloudSources.map((source) => source.id),
    [pointCloudSources],
  );
  const frames =
    useStreamValues<McapTopicPlaybackFrame<PointCloudVisualization> | null>(
      topicIds,
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
export const McapSceneStatusStrip: React.FC<{
  readonly sampling: McapPointCloudSamplingSummary | null;
}> = ({ sampling }) => {
  const publishedNotices = useMcapSceneNotices();
  const producedLocally = useMemo(() => {
    const samplingNotice = buildMcapPointCloudSamplingNotice(
      sampling,
      MAX_POINT_CLOUD_RENDER_POINTS,
    );
    return samplingNotice ? [samplingNotice] : [];
  }, [sampling]);
  const localNotices = useStabilizedMcapNotices(producedLocally);
  const notices = useMemo(
    () => [...localNotices, ...publishedNotices],
    [localNotices, publishedNotices],
  );

  return <McapNoticeStrip notices={notices} />;
};
