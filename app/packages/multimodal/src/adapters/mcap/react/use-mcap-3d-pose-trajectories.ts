import { useEffect, useMemo, useState } from "react";
import type {
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type { Mcap3dViewStateStore } from "./mcap-3d-view-state";
import { useMcap3dViewStateStore } from "./mcap-3d-view-state-context";
import { useMcapPoseTrajectoriesContext } from "./mcap-pose-trajectories-context";
import {
  defaultTrajectoryFrame,
  poseMarkerSceneUpdate,
  trajectorySceneUpdate,
} from "./pose-trajectory";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

/**
 * Pose-trajectory rendering state for the 3D tile: the effective render
 * frame per pose topic (with user overrides for frameless streams) and the
 * synthetic frame-locked SceneUpdates (trajectory lines + current-pose
 * markers) merged into the annotation topics/frames the layer builder
 * consumes. State is local to the calling tile — it resets when the tile
 * remounts. An optional `restore` (per-topic frame overrides, already
 * shape-gated by the caller) seeds the override state at mount.
 */
export function useMcap3dPoseTrajectories({
  annotationFrames,
  frameIds,
  playbackTimeNs,
  poseFrames,
  poseTopics,
  restore = null,
  sceneAnnotationTopics,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly annotationFrames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly frameIds: readonly string[];
  readonly playbackTimeNs: bigint | undefined;
  readonly poseFrames: readonly (McapTopicPlaybackFrame<PoseVisualization> | null)[];
  readonly poseTopics: readonly string[];
  readonly restore?: Readonly<Record<string, string>> | null;
  readonly sceneAnnotationTopics: readonly string[];
  readonly viewStateStore?: Mcap3dViewStateStore;
}) {
  const viewStateStore = useMcap3dViewStateStore(suppliedViewStateStore);
  const trajectories = useMcapPoseTrajectoriesContext();
  const [trajectoryFrameOverrides, setTrajectoryFrameOverrides] = useState<
    Readonly<Record<string, string>>
  >(() => restore ?? {});

  // This effect writes the per-topic trajectory frame overrides through to
  // the session view-state store so they can carry across sample navigation.
  useEffect(() => {
    viewStateStore.recordTrajectoryFrameOverrides(trajectoryFrameOverrides);
  }, [trajectoryFrameOverrides, viewStateStore]);
  // Keyed on frame-id CONTENT, not array identity: `frameIds` is re-derived
  // every playback tick, and letting that identity churn reach the
  // trajectory scene updates would rebuild (and dispose) the
  // multi-thousand-point line geometry every frame.
  const frameIdsKey = useMemo(() => frameIds.join("\0"), [frameIds]);
  const defaultPoseFrame = useMemo(
    () => defaultTrajectoryFrame(frameIdsKey.split("\0")),
    [frameIdsKey],
  );
  const knownFrameIds = useMemo(
    () => new Set(frameIdsKey.split("\0")),
    [frameIdsKey],
  );
  // Effective render frame per pose topic: the stream's own frame wins;
  // frameless streams (JSON odometry) fall back to a user override, then a
  // global-frame name heuristic over the available frames. An override only
  // applies while its frame exists in the streaming frame inventory: a
  // restored override from a previous sample must not pin the trajectory to
  // a frame this recording never publishes (frame ids arrive async, so a
  // valid override takes effect as soon as its frame shows up).
  const trajectoryFrameByTopic = useMemo(() => {
    const framesByTopic = new Map<string, string>();
    for (const topic of poseTopics) {
      const streamFrameId = trajectories.get(topic)?.streamFrameId;
      const override = trajectoryFrameOverrides[topic];
      framesByTopic.set(
        topic,
        streamFrameId ??
          (override && knownFrameIds.has(override) ? override : undefined) ??
          defaultPoseFrame,
      );
    }
    return framesByTopic;
  }, [
    defaultPoseFrame,
    knownFrameIds,
    poseTopics,
    trajectories,
    trajectoryFrameOverrides,
  ]);
  // Trajectory lines as synthetic frame-locked SceneUpdates that ride the
  // existing annotation layer path. The visualization identity is stable per
  // (topic, fetched trajectory, frame) so per-tick envelope rebuilds never
  // regenerate the multi-thousand-point line geometry.
  const trajectorySceneUpdates = useMemo(() => {
    const updates: { topic: string; update: SceneUpdateVisualization }[] = [];
    for (const topic of poseTopics) {
      const trajectory = trajectories.get(topic);
      if (trajectory?.status !== "ready" || trajectory.points.length < 2) {
        continue;
      }
      updates.push({
        topic,
        update: trajectorySceneUpdate({
          frameId: trajectoryFrameByTopic.get(topic) ?? "",
          points: trajectory.points,
          topic,
        }),
      });
    }
    return updates;
  }, [poseTopics, trajectories, trajectoryFrameByTopic]);
  const syntheticPoseAnnotations = useMemo(() => {
    const topics: string[] = [];
    const playbackFrames: McapTopicPlaybackFrame<SceneUpdateVisualization>[] =
      [];
    if (playbackTimeNs === undefined) {
      return { playbackFrames, topics };
    }

    for (const { topic, update } of trajectorySceneUpdates) {
      topics.push(`${topic}#trajectory`);
      playbackFrames.push({
        ageNs: 0n,
        contentTimeNs: playbackTimeNs,
        frame: update,
        requestedTimeNs: playbackTimeNs,
      });
    }
    // Current-pose markers rebuild per pose frame — a single small sphere,
    // deliberately separate from the trajectory line updates.
    poseTopics.forEach((topic, index) => {
      const poseFrame = poseFrames[index];
      if (!poseFrame) {
        return;
      }
      topics.push(`${topic}#pose`);
      playbackFrames.push({
        ageNs: poseFrame.ageNs,
        contentTimeNs: poseFrame.contentTimeNs,
        frame: poseMarkerSceneUpdate({
          frameId:
            poseFrame.frame.coordinateFrameId ??
            trajectoryFrameByTopic.get(topic) ??
            "",
          pose: poseFrame.frame,
          topic,
        }),
        requestedTimeNs: poseFrame.requestedTimeNs,
      });
    });

    return { playbackFrames, topics };
  }, [
    playbackTimeNs,
    poseFrames,
    poseTopics,
    trajectoryFrameByTopic,
    trajectorySceneUpdates,
  ]);
  const combinedAnnotationTopics = useMemo(
    () => [...sceneAnnotationTopics, ...syntheticPoseAnnotations.topics],
    [sceneAnnotationTopics, syntheticPoseAnnotations.topics],
  );
  const combinedAnnotationFrames = useMemo(
    () => [...annotationFrames, ...syntheticPoseAnnotations.playbackFrames],
    [annotationFrames, syntheticPoseAnnotations.playbackFrames],
  );

  return {
    combinedAnnotationFrames,
    combinedAnnotationTopics,
    setTrajectoryFrameOverrides,
    trajectories,
    trajectoryFrameByTopic,
    trajectoryFrameOverrides,
  };
}
