import { useEffect, useMemo, useState } from "react";
import type {
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import type { Episode3dViewStateStore } from "./episode-3d-view-state";
import { useEpisode3dViewStateStore } from "./episode-3d-view-state-context";
import { useEpisodePoseTrajectoriesContext } from "./episode-pose-trajectories-context";
import {
  defaultTrajectoryFrame,
  poseMarkerSceneUpdate,
  trajectorySceneUpdate,
} from "./pose-trajectory";
import type { EpisodeStreamPlaybackFrame } from "../playback/use-episode-stream-values";

/**
 * Pose-trajectory rendering state for the 3D tile: the effective render
 * frame per pose stream (with user overrides for frameless streams) and the
 * synthetic frame-locked SceneUpdates (trajectory lines + current-pose
 * markers) merged into the annotation streams/frames the layer builder
 * consumes. State is local to the calling tile — it resets when the tile
 * remounts. An optional `restore` (per-stream frame overrides, already
 * shape-gated by the caller) seeds the override state at mount.
 */
export function useEpisode3dPoseTrajectories({
  annotationFrames,
  frameIds,
  playbackTimeNs,
  poseFrames,
  poseStreams,
  restore = null,
  sceneAnnotationStreams,
  viewStateStore: suppliedViewStateStore,
}: {
  readonly annotationFrames: readonly (EpisodeStreamPlaybackFrame<SceneUpdateVisualization> | null)[];
  readonly frameIds: readonly string[];
  readonly playbackTimeNs: bigint | undefined;
  readonly poseFrames: readonly (EpisodeStreamPlaybackFrame<PoseVisualization> | null)[];
  readonly poseStreams: readonly string[];
  readonly restore?: Readonly<Record<string, string>> | null;
  readonly sceneAnnotationStreams: readonly string[];
  readonly viewStateStore?: Episode3dViewStateStore;
}) {
  const viewStateStore = useEpisode3dViewStateStore(suppliedViewStateStore);
  const trajectories = useEpisodePoseTrajectoriesContext();
  const [trajectoryFrameOverrides, setTrajectoryFrameOverrides] = useState<
    Readonly<Record<string, string>>
  >(() => restore ?? {});

  // This effect writes the per-stream trajectory frame overrides through to
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
  // Effective render frame per pose stream: the stream's own frame wins;
  // frameless streams (JSON odometry) fall back to a user override, then a
  // global-frame name heuristic over the available frames. An override only
  // applies while its frame exists in the streaming frame inventory: a
  // restored override from a previous sample must not pin the trajectory to
  // a frame this recording never publishes (frame ids arrive async, so a
  // valid override takes effect as soon as its frame shows up).
  const trajectoryFrameByStream = useMemo(() => {
    const framesByStream = new Map<string, string>();
    for (const stream of poseStreams) {
      const streamFrameId = trajectories.get(stream)?.streamFrameId;
      const override = trajectoryFrameOverrides[stream];
      framesByStream.set(
        stream,
        streamFrameId ??
          (override && knownFrameIds.has(override) ? override : undefined) ??
          defaultPoseFrame,
      );
    }
    return framesByStream;
  }, [
    defaultPoseFrame,
    knownFrameIds,
    poseStreams,
    trajectories,
    trajectoryFrameOverrides,
  ]);
  // Trajectory lines as synthetic frame-locked SceneUpdates that ride the
  // existing annotation layer path. The visualization identity is stable per
  // (stream, fetched trajectory, frame) so per-tick envelope rebuilds never
  // regenerate the multi-thousand-point line geometry.
  const trajectorySceneUpdates = useMemo(() => {
    const updates: { stream: string; update: SceneUpdateVisualization }[] = [];
    for (const stream of poseStreams) {
      const trajectory = trajectories.get(stream);
      if (trajectory?.status !== "ready" || trajectory.points.length < 2) {
        continue;
      }
      updates.push({
        stream,
        update: trajectorySceneUpdate({
          frameId: trajectoryFrameByStream.get(stream) ?? "",
          points: trajectory.points,
          stream,
        }),
      });
    }
    return updates;
  }, [poseStreams, trajectories, trajectoryFrameByStream]);
  const syntheticPoseAnnotations = useMemo(() => {
    const streams: string[] = [];
    const playbackFrames: EpisodeStreamPlaybackFrame<SceneUpdateVisualization>[] =
      [];
    if (playbackTimeNs === undefined) {
      return { playbackFrames, streams };
    }

    for (const { stream, update } of trajectorySceneUpdates) {
      streams.push(`${stream}#trajectory`);
      playbackFrames.push({
        ageNs: 0n,
        contentTimeNs: playbackTimeNs,
        frame: update,
        requestedTimeNs: playbackTimeNs,
      });
    }
    // Current-pose markers rebuild per pose frame — a single small sphere,
    // deliberately separate from the trajectory line updates.
    poseStreams.forEach((stream, index) => {
      const poseFrame = poseFrames[index];
      if (!poseFrame) {
        return;
      }
      streams.push(`${stream}#pose`);
      playbackFrames.push({
        ageNs: poseFrame.ageNs,
        contentTimeNs: poseFrame.contentTimeNs,
        frame: poseMarkerSceneUpdate({
          frameId:
            poseFrame.frame.coordinateFrameId ??
            trajectoryFrameByStream.get(stream) ??
            "",
          pose: poseFrame.frame,
          stream,
        }),
        requestedTimeNs: poseFrame.requestedTimeNs,
      });
    });

    return { playbackFrames, streams };
  }, [
    playbackTimeNs,
    poseFrames,
    poseStreams,
    trajectoryFrameByStream,
    trajectorySceneUpdates,
  ]);
  const combinedAnnotationStreams = useMemo(
    () => [...sceneAnnotationStreams, ...syntheticPoseAnnotations.streams],
    [sceneAnnotationStreams, syntheticPoseAnnotations.streams],
  );
  const combinedAnnotationFrames = useMemo(
    () => [...annotationFrames, ...syntheticPoseAnnotations.playbackFrames],
    [annotationFrames, syntheticPoseAnnotations.playbackFrames],
  );

  return {
    combinedAnnotationFrames,
    combinedAnnotationStreams,
    setTrajectoryFrameOverrides,
    trajectories,
    trajectoryFrameByStream,
    trajectoryFrameOverrides,
  };
}
