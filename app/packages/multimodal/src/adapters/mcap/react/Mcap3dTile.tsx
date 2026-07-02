import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Vector3 } from "three";
import type {
  CameraCalibrationVisualization,
  EncodedImageVisualization,
  GridVisualization,
  LocationVisualization,
  PointCloudVisualization,
  PoseVisualization,
  SceneUpdateVisualization,
} from "../../../decoders";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { chooseCalibrationTopic } from "../topic-matching";
import {
  PointCloudPanel,
  type PointCloudCameraPose,
  type PointCloudFrameTransform,
  type PointCloudPanelRenderStats,
} from "../../../visualization/panels/point-cloud";
import {
  cameraPoseFromTrackingAnchor,
  cameraTargetPoseFromFrameTransform,
  cameraTrackingAnchorFromPose,
  identityCameraTargetPose,
  isFollowTrackingMode,
  type Mcap3dCameraTargetPose,
  type Mcap3dCameraTrackingAnchor,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import {
  build3dLayers,
  type Mcap3dTransformGapWarning,
} from "./mcap-3d-layers";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import { useMcapPoseTrajectoriesContext } from "./mcap-pose-trajectories-context";
import {
  defaultTrajectoryFrame,
  locationHudLine,
  poseMarkerSceneUpdate,
  speedHudLine,
  trajectorySceneUpdate,
} from "./pose-trajectory";
import {
  isMcapLatencyDebugEnabled,
  markMcapLatencyEvent,
} from "../mcap-latency-debug";
import { useMcapModalSettings } from "./mcap-modal-settings";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import type { McapTileProps } from "./mcap-tile-types";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import {
  useMcapTopicPlaybackFrames,
  type McapTopicPlaybackFrame,
} from "./use-mcap-topic-stream";
import { useMcapPlaybackTimeNs } from "./use-mcap-playback-time-ns";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

const TILE_TYPE_LABEL = "3D";
const TRACKING_MODES: readonly {
  readonly label: string;
  readonly value: Mcap3dTrackingMode;
}[] = [
  {
    label: "Free",
    value: "free",
  },
  {
    label: "Follow Position (translation only)",
    value: "position",
  },
  {
    label: "Follow Heading (translation + yaw)",
    value: "heading",
  },
  {
    label: "Follow Pose (full SE3)",
    value: "pose",
  },
] as const;
const DEFAULT_TRACKING_MODE: Mcap3dTrackingMode = "free";
// Auto-selected world-frame defaults, most-preferred first. Ego-centric frames
// keep local sensor geometry stable by default; users can opt into map/world
// frames when they want global motion. These are soft heuristics on frame
// *names* (not topic/schema names): if none are present the selection falls
// back to whatever frames the data exposes.
const PREFERRED_WORLD_FRAMES = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
  "map",
  "world",
  "odom",
];
const PREFERRED_CAMERA_TARGET_FRAMES = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
];
const PROVISIONAL_TOPIC_KEYWORDS: readonly {
  readonly score: number;
  readonly value: string;
}[] = [
  { score: 90, value: "lidar_top" },
  { score: 90, value: "top_lidar" },
  { score: 70, value: "lidar" },
  { score: 60, value: "velodyne" },
  { score: 60, value: "ouster" },
  { score: 60, value: "hesai" },
  { score: 60, value: "robosense" },
  { score: 35, value: "point_cloud" },
  { score: 35, value: "pointcloud" },
  { score: 25, value: "/points" },
  { score: 20, value: "points" },
];
const PROVISIONAL_TOPIC_PENALTIES: readonly {
  readonly score: number;
  readonly value: string;
}[] = [{ score: -50, value: "radar" }];
type FrameSelectionSource = "auto" | "user";
type CameraPoseChangeSource = "focus" | "initial" | "interaction";
type Mcap3dPlacementStatus =
  | "empty"
  | "provisional"
  | "transformed"
  | "unframed";
interface ProvisionalCameraView {
  readonly cameraPose: PointCloudCameraPose;
  readonly contentTimeNs: bigint;
  readonly sourceFrameId: string;
}
type CameraTargetResolution =
  | {
      readonly pose: Mcap3dCameraTargetPose;
      readonly status: "resolved";
    }
  | {
      readonly status: "missing" | "pending";
    };

/**
 * 3D tile: renders every enabled 3D-renderable source fused into one shared
 * scene. Unlike the image tile, sources are multi-selectable — overlaying
 * several sensors in one view is the point of a 3D panel — so the settings
 * sidebar offers checkboxes and panel-specific frame controls.
 */
const Mcap3dTile: React.FC<McapTileProps> = () => {
  const sources = useSceneInventory();
  const renderableSources = useMemo(
    () => sources.filter(is3dRenderableSource),
    [sources],
  );
  const pointCloudSources = useMemo(
    () => renderableSources.filter(isPointCloudSource),
    [renderableSources],
  );
  const mapLayerSources = useMemo(
    () => renderableSources.filter(isMapLayerSource),
    [renderableSources],
  );
  const cameraSources = useMemo(
    () => renderableSources.filter(isCameraCalibrationSource),
    [renderableSources],
  );
  const poseSources = useMemo(
    () => renderableSources.filter(isPoseSource),
    [renderableSources],
  );
  const sceneAnnotationSources = useMemo(
    () => renderableSources.filter(isSceneAnnotationSource),
    [renderableSources],
  );
  const frameTransforms = useMcapFrameTransformsContext();
  const { temporalPolicy } = useMcapModalSettings();
  const setTileTitle = useSetTileTitle();
  const latencyDebugEnabled = useMemo(() => isMcapLatencyDebugEnabled(), []);
  // Start with every source enabled. This tile only mounts after the scene
  // inventory is ready (the renderer gates on it), so `renderableSources` is
  // already populated and the lazy initializer captures the full set once.
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(
    () => new Set(renderableSources.map((s) => s.id)),
  );
  const [worldFrameId, setWorldFrameId] = useState("");
  const [cameraTargetFrameId, setCameraTargetFrameId] = useState("");
  const [worldFrameSelectionSource, setWorldFrameSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const [cameraTargetSelectionSource, setCameraTargetSelectionSource] =
    useState<FrameSelectionSource>("auto");
  const [trackingMode, setTrackingMode] = useState<Mcap3dTrackingMode>(
    DEFAULT_TRACKING_MODE,
  );
  const [cameraPose, setCameraPose] = useState<PointCloudCameraPose | null>(
    null,
  );
  const [trackingAnchor, setTrackingAnchor] =
    useState<Mcap3dCameraTrackingAnchor | null>(null);
  const knownRenderableSourceIdsRef = useRef<ReadonlySet<string>>(
    new Set(renderableSources.map((s) => s.id)),
  );
  const latestCameraPoseRef = useRef<PointCloudCameraPose | null>(null);
  const lastProvisionalViewRef = useRef<ProvisionalCameraView | null>(null);
  const hadRecentProvisionalPlacementRef = useRef(false);
  const cameraPoseRemapKeyRef = useRef<string | null>(null);
  const lastDebugPlacementStateRef = useRef<string | null>(null);

  // This effect keeps the enabled source set aligned as 3D sources appear or
  // disappear after the tile mounts.
  useEffect(() => {
    const currentIds = new Set(renderableSources.map((s) => s.id));
    const previousIds = knownRenderableSourceIdsRef.current;
    setEnabled((current) => {
      const next = new Set(current);
      let changed = false;

      for (const id of currentIds) {
        if (!previousIds.has(id) && !next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      for (const id of next) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
    knownRenderableSourceIdsRef.current = currentIds;
  }, [renderableSources]);

  // Prefer LiDAR-like point clouds first for initial fetch/paint. SceneUpdate
  // sources remain schema-driven labels and do not affect the provisional cloud
  // choice.
  const selectedPointCloudSources = useMemo(
    () =>
      sortPointCloudSourcesForInitialPaint(
        pointCloudSources.filter((s) => enabled.has(s.id)),
      ),
    [pointCloudSources, enabled],
  );
  const selectedSceneAnnotationSources = useMemo(
    () => sceneAnnotationSources.filter((s) => enabled.has(s.id)),
    [sceneAnnotationSources, enabled],
  );
  const selectedMapLayerSources = useMemo(
    () => mapLayerSources.filter((s) => enabled.has(s.id)),
    [mapLayerSources, enabled],
  );
  const selectedCameraSources = useMemo(
    () => cameraSources.filter((s) => enabled.has(s.id)),
    [cameraSources, enabled],
  );
  const pointCloudTopics = useMemo(
    () => selectedPointCloudSources.map((s) => s.id),
    [selectedPointCloudSources],
  );
  const sceneAnnotationTopics = useMemo(
    () => selectedSceneAnnotationSources.map((s) => s.id),
    [selectedSceneAnnotationSources],
  );
  const mapLayerTopics = useMemo(
    () => selectedMapLayerSources.map((s) => s.id),
    [selectedMapLayerSources],
  );
  const cameraTopics = useMemo(
    () => selectedCameraSources.map((s) => s.id),
    [selectedCameraSources],
  );
  const selectedPoseSources = useMemo(
    () => poseSources.filter((s) => enabled.has(s.id)),
    [poseSources, enabled],
  );
  const poseTopics = useMemo(
    () => selectedPoseSources.map((s) => s.id),
    [selectedPoseSources],
  );
  // Camera frames on frustum image planes: pair each calibration topic with
  // its camera's image stream (same prefix convention the image tile uses,
  // inverted) so the frustum can show what the camera currently sees.
  const [showCameraImages, setShowCameraImages] = useState(true);
  const imageTopicByCalibrationTopic = useMemo(() => {
    const pairs = new Map<string, string>();
    for (const source of sources) {
      if (source.type !== MCAP_SOURCE_TYPE.IMAGE) {
        continue;
      }
      const calibrationTopic = chooseCalibrationTopic(source.id, cameraTopics);
      if (calibrationTopic && !pairs.has(calibrationTopic)) {
        pairs.set(calibrationTopic, source.id);
      }
    }
    return pairs;
  }, [cameraTopics, sources]);
  const frustumImageTopics = useMemo(
    () =>
      showCameraImages
        ? cameraTopics.map(
            (topic) => imageTopicByCalibrationTopic.get(topic) ?? "",
          )
        : [],
    [cameraTopics, imageTopicByCalibrationTopic, showCameraImages],
  );
  const frustumImageFrames =
    useMcapTopicPlaybackFrames<EncodedImageVisualization>(frustumImageTopics);
  const selectedTopics = useMemo(
    () => [
      ...pointCloudTopics,
      ...mapLayerTopics,
      ...cameraTopics,
      ...poseTopics,
      ...sceneAnnotationTopics,
    ],
    [
      cameraTopics,
      mapLayerTopics,
      pointCloudTopics,
      poseTopics,
      sceneAnnotationTopics,
    ],
  );
  const selectedTopicsKey = useMemo(
    () => selectedTopics.join("\0"),
    [selectedTopics],
  );
  const frames =
    useMcapTopicPlaybackFrames<PointCloudVisualization>(pointCloudTopics);
  const annotationFrames = useMcapTopicPlaybackFrames<SceneUpdateVisualization>(
    sceneAnnotationTopics,
  );
  const gridFrames =
    useMcapTopicPlaybackFrames<GridVisualization>(mapLayerTopics);
  const calibrationFrames =
    useMcapTopicPlaybackFrames<CameraCalibrationVisualization>(cameraTopics);
  const poseFrames = useMcapTopicPlaybackFrames<PoseVisualization>(poseTopics);
  // Location fixes are pure telemetry (no checkbox, no scene content): the
  // first LocationFix stream in the inventory feeds the HUD readout.
  const locationTopics = useMemo(() => {
    const first = sources.find((s) => s.type === MCAP_SOURCE_TYPE.LOCATION);
    return first ? [first.id] : [];
  }, [sources]);
  const locationFrames =
    useMcapTopicPlaybackFrames<LocationVisualization>(locationTopics);
  const playbackTimeNs = useMcapPlaybackTimeNs();
  const frameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameTransforms.frameIds,
        ...frameIdsFromFrames(frames),
        ...frameIdsFromGridFrames(gridFrames),
        ...frameIdsFromCalibrationFrames(calibrationFrames),
        ...frameIdsFromSceneAnnotationFrames(annotationFrames),
      ]),
    [
      annotationFrames,
      calibrationFrames,
      frameTransforms.frameIds,
      frames,
      gridFrames,
    ],
  );

  // This effect keeps the world frame on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setWorldFrameId((current) =>
      nextFrameSelection({
        allowFallback: frameTransforms.frameIds.length > 0,
        current,
        frameIds,
        preferred: PREFERRED_WORLD_FRAMES,
        selectionSource: worldFrameSelectionSource,
      }),
    );
  }, [frameIds, frameTransforms.frameIds.length, worldFrameSelectionSource]);

  // This effect keeps the camera target on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setCameraTargetFrameId((current) =>
      nextFrameSelection({
        allowFallback: frameTransforms.frameIds.length > 0,
        current,
        frameIds,
        preferred: [...PREFERRED_CAMERA_TARGET_FRAMES, worldFrameId],
        selectionSource: cameraTargetSelectionSource,
      }),
    );
  }, [
    cameraTargetSelectionSource,
    frameIds,
    frameTransforms.frameIds.length,
    worldFrameId,
  ]);

  // This effect syncs the tile title with the current 3D source selection.
  useEffect(() => {
    const label =
      selectedTopics.length === 1
        ? renderableSources.find((s) => s.id === selectedTopics[0])?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL);
  }, [selectedTopics, renderableSources, setTileTitle]);

  const provisionalTopicId = useMemo(
    () => selectProvisionalPointCloudTopic(selectedPointCloudSources, frames),
    [frames, selectedPointCloudSources],
  );
  const provisionalPlaybackFrame = useMemo(
    () => playbackFrameForTopic(pointCloudTopics, frames, provisionalTopicId),
    [frames, pointCloudTopics, provisionalTopicId],
  );
  const trajectories = useMcapPoseTrajectoriesContext();
  const [trajectoryFrameOverrides, setTrajectoryFrameOverrides] = useState<
    Readonly<Record<string, string>>
  >({});
  // Keyed on frame-id CONTENT, not array identity: `frameIds` is re-derived
  // every playback tick, and letting that identity churn reach the
  // trajectory scene updates would rebuild (and dispose) the
  // multi-thousand-point line geometry every frame.
  const frameIdsKey = useMemo(() => frameIds.join("\0"), [frameIds]);
  const defaultPoseFrame = useMemo(
    () => defaultTrajectoryFrame(frameIdsKey.split("\0")),
    [frameIdsKey],
  );
  // Effective render frame per pose topic: the stream's own frame wins;
  // frameless streams (JSON odometry) fall back to a user override, then a
  // global-frame name heuristic over the available frames.
  const trajectoryFrameByTopic = useMemo(() => {
    const framesByTopic = new Map<string, string>();
    for (const topic of poseTopics) {
      const streamFrameId = trajectories.get(topic)?.streamFrameId;
      framesByTopic.set(
        topic,
        streamFrameId ?? trajectoryFrameOverrides[topic] ?? defaultPoseFrame,
      );
    }
    return framesByTopic;
  }, [defaultPoseFrame, poseTopics, trajectories, trajectoryFrameOverrides]);
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
  const {
    cameraFrustumLayers,
    clampedFrameIds,
    gridLayers,
    largeInterpolationGaps,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    transformedLayerCount,
    unresolvedFrameIds,
  } = useMemo(() => {
    return build3dLayers({
      annotationFrames: combinedAnnotationFrames,
      calibrationFrames,
      frameTransforms,
      frames,
      gridFrames,
      largeInterpolationGapWarningNs: msToNs(
        temporalPolicy.transformGapWarningMs,
      ),
      provisionalTopicId,
      selectedAnnotationTopics: combinedAnnotationTopics,
      selectedCalibrationTopics: cameraTopics,
      selectedGridTopics: mapLayerTopics,
      selectedTopics: pointCloudTopics,
      worldFrameId,
    });
  }, [
    calibrationFrames,
    cameraTopics,
    combinedAnnotationFrames,
    combinedAnnotationTopics,
    frameTransforms,
    frames,
    gridFrames,
    mapLayerTopics,
    pointCloudTopics,
    provisionalTopicId,
    temporalPolicy.transformGapWarningMs,
    worldFrameId,
  ]);
  // Attach each camera's current image to its frustum layer. Done outside
  // build3dLayers so the pure layer builder stays image-agnostic; index
  // alignment with cameraTopics mirrors the playback-frames arrays.
  const frustumLayers = useMemo(
    () =>
      cameraFrustumLayers.map((layer) => {
        const index = cameraTopics.indexOf(layer.id);
        const imageFrame = index >= 0 ? frustumImageFrames[index] : null;
        return imageFrame
          ? {
              ...layer,
              image: imageFrame.frame,
              imageContentTimeNs: imageFrame.contentTimeNs,
            }
          : layer;
      }),
    [cameraFrustumLayers, cameraTopics, frustumImageFrames],
  );
  // Schema-driven telemetry: speed from the first enabled pose stream whose
  // latest sample carries velocity, coordinates from the first LocationFix
  // stream — never keyed on topic names.
  const hudLines = useMemo(() => {
    const lines: string[] = [];
    for (const poseFrame of poseFrames) {
      const line = speedHudLine(poseFrame?.frame.velocity);
      if (line) {
        lines.push(line);
        break;
      }
    }
    const location = locationHudLine(locationFrames[0]?.frame);
    if (location) {
      lines.push(location);
    }
    return lines;
  }, [locationFrames, poseFrames]);
  const placementStatus = useMemo<Mcap3dPlacementStatus>(
    () =>
      provisionalFrameIds.length > 0
        ? "provisional"
        : transformedLayerCount > 0
          ? "transformed"
          : pointCloudLayers.length > 0 ||
              sceneAnnotationLayers.length > 0 ||
              gridLayers.length > 0 ||
              cameraFrustumLayers.length > 0
            ? "unframed"
            : "empty",
    [
      cameraFrustumLayers.length,
      gridLayers.length,
      pointCloudLayers.length,
      provisionalFrameIds.length,
      sceneAnnotationLayers.length,
      transformedLayerCount,
    ],
  );
  const placementWarning = useMemo(() => {
    const parts: string[] = [];
    if (provisionalFrameIds.length > 0) {
      parts.push(
        `Positioning transforms loading: displaying source-frame preview for ${provisionalFrameIds.join(
          ", ",
        )}`,
      );
    }
    if (pendingAnnotationFrameIds.length > 0) {
      parts.push(
        `Annotation transforms loading: hiding boxes in ${pendingAnnotationFrameIds.join(
          ", ",
        )}`,
      );
    }
    if (pendingGridFrameIds.length > 0) {
      parts.push(
        `Map layer transforms loading: hiding grids in ${pendingGridFrameIds.join(
          ", ",
        )}`,
      );
    }
    if (pendingFrustumFrameIds.length > 0) {
      parts.push(
        `Camera transforms loading: hiding frustums in ${pendingFrustumFrameIds.join(
          ", ",
        )}`,
      );
    }

    return parts.length > 0 ? parts.join(" | ") : null;
  }, [
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    provisionalFrameIds,
  ]);
  const transformWarning = useMemo(
    () =>
      transformWarningText({
        clampedFrameIds,
        frameTransformsError: frameTransforms.error,
        largeInterpolationGaps,
        unresolvedFrameIds,
        worldFrameId,
      }),
    [
      clampedFrameIds,
      frameTransforms.error,
      largeInterpolationGaps,
      unresolvedFrameIds,
      worldFrameId,
    ],
  );
  const followTrackingMode = isFollowTrackingMode(trackingMode)
    ? trackingMode
    : null;
  const cameraTargetResolution = useMemo(
    () =>
      resolveCameraTargetPose({
        cameraTargetFrameId,
        frameTransforms,
        playbackTimeNs,
        worldFrameId,
      }),
    [cameraTargetFrameId, frameTransforms, playbackTimeNs, worldFrameId],
  );
  const cameraTargetPose =
    cameraTargetResolution.status === "resolved"
      ? cameraTargetResolution.pose
      : null;
  const controlledCameraPose = useMemo(() => {
    if (
      !followTrackingMode ||
      !trackingAnchor ||
      !cameraTargetPose ||
      !trackingAnchorMatches({
        anchor: trackingAnchor,
        mode: followTrackingMode,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      })
    ) {
      return null;
    }

    return cameraPoseFromTrackingAnchor(trackingAnchor, cameraTargetPose);
  }, [
    cameraTargetFrameId,
    cameraTargetPose,
    followTrackingMode,
    trackingAnchor,
    worldFrameId,
  ]);
  const panelCameraPose = controlledCameraPose ?? cameraPose;
  const cameraTrackingWarning = useMemo(
    () =>
      cameraTrackingWarningText({
        cameraTargetFrameId,
        cameraTargetStatus: cameraTargetResolution.status,
        trackingMode,
        worldFrameId,
      }),
    [
      cameraTargetFrameId,
      cameraTargetResolution.status,
      trackingMode,
      worldFrameId,
    ],
  );
  const panelWarning = useMemo(
    () =>
      joinWarnings(placementWarning, transformWarning, cameraTrackingWarning),
    [cameraTrackingWarning, placementWarning, transformWarning],
  );

  // Re-anchor when the user changes tracking mode or target frame. During
  // normal playback the anchor remains stable and the target transform moves.
  useEffect(() => {
    if (!followTrackingMode) {
      setTrackingAnchor(null);
      return;
    }
    if (!cameraTargetPose || !cameraTargetFrameId || !worldFrameId) {
      return;
    }

    setTrackingAnchor((current) => {
      if (
        trackingAnchorMatches({
          anchor: current,
          mode: followTrackingMode,
          targetFrameId: cameraTargetFrameId,
          worldFrameId,
        })
      ) {
        return current;
      }

      const basePose = latestCameraPoseRef.current ?? cameraPose;
      if (!basePose) {
        return current;
      }

      return cameraTrackingAnchorFromPose({
        cameraPose: basePose,
        mode: followTrackingMode,
        targetFrameId: cameraTargetFrameId,
        targetPose: cameraTargetPose,
        worldFrameId,
      });
    });
  }, [
    cameraPose,
    cameraTargetFrameId,
    cameraTargetPose,
    followTrackingMode,
    worldFrameId,
  ]);

  useEffect(() => {
    const latestPose = controlledCameraPose ?? cameraPose;
    if (latestPose) {
      latestCameraPoseRef.current = latestPose;
    }
  }, [cameraPose, controlledCameraPose]);

  useEffect(() => {
    lastProvisionalViewRef.current = null;
    hadRecentProvisionalPlacementRef.current = false;
    cameraPoseRemapKeyRef.current = null;
  }, [selectedTopicsKey]);

  const rememberProvisionalCameraPose = useCallback(
    (pose: PointCloudCameraPose) => {
      if (placementStatus !== "provisional" || !provisionalPlaybackFrame) {
        return;
      }

      const sourceFrameId =
        provisionalPlaybackFrame.frame.coordinateFrameId?.trim();
      if (!sourceFrameId || !provisionalFrameIds.includes(sourceFrameId)) {
        return;
      }

      lastProvisionalViewRef.current = {
        cameraPose: pose,
        contentTimeNs: provisionalPlaybackFrame.contentTimeNs,
        sourceFrameId,
      };
    },
    [placementStatus, provisionalFrameIds, provisionalPlaybackFrame],
  );

  useLayoutEffect(() => {
    if (placementStatus === "provisional") {
      hadRecentProvisionalPlacementRef.current = true;
      return;
    }
    if (
      placementStatus !== "transformed" ||
      !hadRecentProvisionalPlacementRef.current
    ) {
      return;
    }

    hadRecentProvisionalPlacementRef.current = false;
    if (controlledCameraPose || !worldFrameId) {
      return;
    }

    const provisionalView = lastProvisionalViewRef.current;
    if (!provisionalView || provisionalView.sourceFrameId === worldFrameId) {
      return;
    }

    const remapKey = `${provisionalView.sourceFrameId}->${worldFrameId}:${provisionalView.contentTimeNs.toString()}`;
    if (cameraPoseRemapKeyRef.current === remapKey) {
      return;
    }

    const resolution = frameTransforms.resolve(
      provisionalView.sourceFrameId,
      worldFrameId,
      provisionalView.contentTimeNs,
    );
    if (resolution.status !== "resolved") {
      return;
    }

    const remappedPose = transformCameraPose(
      provisionalView.cameraPose,
      resolution.transform,
    );
    cameraPoseRemapKeyRef.current = remapKey;
    latestCameraPoseRef.current = remappedPose;
    setCameraPose(remappedPose);

    if (latencyDebugEnabled) {
      markMcapLatencyEvent("3d camera pose remapped", {
        contentTimeNs: provisionalView.contentTimeNs.toString(),
        from: cameraPoseDebugDetail(provisionalView.cameraPose),
        sourceFrameId: provisionalView.sourceFrameId,
        targetFrameId: worldFrameId,
        to: cameraPoseDebugDetail(remappedPose),
        transformKind: resolution.resolutionKind ?? "unknown",
      });
    }
  }, [
    controlledCameraPose,
    frameTransforms,
    latencyDebugEnabled,
    placementStatus,
    worldFrameId,
  ]);

  const toggleSource = useCallback((id: string, checked: boolean) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);
  const updateWorldFrameId = useCallback((frameId: string) => {
    setWorldFrameSelectionSource("user");
    setWorldFrameId(frameId);
  }, []);
  const updateCameraTargetFrameId = useCallback((frameId: string) => {
    setCameraTargetSelectionSource("user");
    setCameraTargetFrameId(frameId);
  }, []);
  const handleCameraPoseChange = useCallback(
    (pose: PointCloudCameraPose, source: CameraPoseChangeSource) => {
      latestCameraPoseRef.current = pose;
      rememberProvisionalCameraPose(pose);
      if (source !== "initial") {
        setCameraPose(pose);
      }
      if (
        !followTrackingMode ||
        !cameraTargetPose ||
        !cameraTargetFrameId ||
        !worldFrameId
      ) {
        return;
      }

      setTrackingAnchor(
        cameraTrackingAnchorFromPose({
          cameraPose: pose,
          mode: followTrackingMode,
          targetFrameId: cameraTargetFrameId,
          targetPose: cameraTargetPose,
          worldFrameId,
        }),
      );
    },
    [
      cameraTargetFrameId,
      cameraTargetPose,
      followTrackingMode,
      rememberProvisionalCameraPose,
      worldFrameId,
    ],
  );
  const handlePanelRenderStats = useCallback(
    (stats: PointCloudPanelRenderStats) => {
      if (stats.cameraPose) {
        latestCameraPoseRef.current = stats.cameraPose;
        rememberProvisionalCameraPose(stats.cameraPose);
      }
      if (!latencyDebugEnabled) {
        return;
      }
      const detail = {
        ...stats,
        ...(stats.cameraPose
          ? { cameraPose: cameraPoseDebugDetail(stats.cameraPose) }
          : {}),
        placementStatus,
        provisionalFrameIds,
        transformedLayerCount,
        worldFrameId,
      };
      markMcapLatencyEvent("point cloud panel painted", detail, {
        onceKey: "first-point-cloud-panel-painted",
      });
      if (placementStatus === "provisional") {
        markMcapLatencyEvent("provisional point cloud panel painted", detail, {
          onceKey: "first-provisional-point-cloud-panel-painted",
        });
      }
      if (placementStatus === "transformed") {
        markMcapLatencyEvent("transformed point cloud panel painted", detail, {
          onceKey: "first-transformed-point-cloud-panel-painted",
        });
      }
    },
    [
      latencyDebugEnabled,
      placementStatus,
      provisionalFrameIds,
      rememberProvisionalCameraPose,
      transformedLayerCount,
      worldFrameId,
    ],
  );

  useEffect(() => {
    if (
      !latencyDebugEnabled ||
      (pointCloudLayers.length === 0 &&
        sceneAnnotationLayers.length === 0 &&
        gridLayers.length === 0 &&
        cameraFrustumLayers.length === 0)
    ) {
      return;
    }

    const detail = {
      annotationLayers: sceneAnnotationLayers.length,
      frustumLayers: cameraFrustumLayers.length,
      gridLayers: gridLayers.length,
      layers:
        pointCloudLayers.length +
        sceneAnnotationLayers.length +
        gridLayers.length +
        cameraFrustumLayers.length,
      placementStatus,
      pointCount: pointCountForLayers(pointCloudLayers),
      pendingAnnotationFrameIds,
      pendingFrustumFrameIds,
      pendingGridFrameIds,
      provisionalFrameIds,
      transformStatus: frameTransforms.status,
      transformedLayerCount,
      worldFrameId,
    };
    markMcapLatencyEvent("3d layers ready", detail, {
      onceKey: "first-3d-layers-ready",
    });
    if (placementStatus === "provisional") {
      markMcapLatencyEvent("provisional 3d layers ready", detail, {
        onceKey: "first-provisional-3d-layers-ready",
      });
    }
    if (placementStatus === "transformed") {
      markMcapLatencyEvent("transformed 3d layers ready", detail, {
        onceKey: "first-transformed-3d-layers-ready",
      });
    }
  }, [
    cameraFrustumLayers.length,
    frameTransforms.status,
    gridLayers.length,
    latencyDebugEnabled,
    placementStatus,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    transformedLayerCount,
    worldFrameId,
  ]);

  useEffect(() => {
    if (
      !latencyDebugEnabled ||
      (pointCloudLayers.length === 0 &&
        sceneAnnotationLayers.length === 0 &&
        gridLayers.length === 0 &&
        cameraFrustumLayers.length === 0)
    ) {
      return;
    }

    const debugStateKey = [
      placementStatus,
      pointCloudLayers.length,
      sceneAnnotationLayers.length,
      gridLayers.length,
      cameraFrustumLayers.length,
      transformedLayerCount,
      pendingAnnotationFrameIds.join(","),
      pendingFrustumFrameIds.join(","),
      pendingGridFrameIds.join(","),
      provisionalFrameIds.join(","),
      unresolvedFrameIds.join(","),
      worldFrameId,
      frameTransforms.status,
      frameTransforms.frameIds.length,
      cameraTargetFrameId,
      cameraTargetResolution.status,
      trackingMode,
      controlledCameraPose ? "controlled" : "uncontrolled",
    ].join("|");
    if (debugStateKey === lastDebugPlacementStateRef.current) {
      return;
    }
    lastDebugPlacementStateRef.current = debugStateKey;

    markMcapLatencyEvent("3d placement state changed", {
      cameraTargetFrameId,
      cameraTargetStatus: cameraTargetResolution.status,
      controlledCamera: controlledCameraPose !== null,
      frameIds: frameIds.length,
      annotationLayers: sceneAnnotationLayers.length,
      frustumLayers: cameraFrustumLayers.length,
      gridLayers: gridLayers.length,
      layers:
        pointCloudLayers.length +
        sceneAnnotationLayers.length +
        gridLayers.length +
        cameraFrustumLayers.length,
      placementStatus,
      pendingAnnotationFrameIds,
      pendingFrustumFrameIds,
      pendingGridFrameIds,
      pointCount: pointCountForLayers(pointCloudLayers),
      provisionalFrameIds,
      transformFrameIds: frameTransforms.frameIds.length,
      transformStatus: frameTransforms.status,
      transformedLayerCount,
      unresolvedFrameIds,
      worldFrameId,
      trackingMode,
    });
  }, [
    cameraFrustumLayers.length,
    cameraTargetFrameId,
    cameraTargetResolution.status,
    controlledCameraPose,
    frameIds.length,
    frameTransforms.frameIds.length,
    frameTransforms.status,
    gridLayers.length,
    latencyDebugEnabled,
    pendingAnnotationFrameIds,
    pendingFrustumFrameIds,
    pendingGridFrameIds,
    placementStatus,
    pointCloudLayers,
    provisionalFrameIds,
    sceneAnnotationLayers,
    trackingMode,
    transformedLayerCount,
    unresolvedFrameIds,
    worldFrameId,
  ]);

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Geometry
            </Text>
            {pointCloudSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {pointCloudTopics.length.toLocaleString()} of{" "}
                  {pointCloudSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {pointCloudSources.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No point cloud topics available
              </span>
            )}
          </div>

          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Map Layers
            </Text>
            {mapLayerSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {mapLayerTopics.length.toLocaleString()} of{" "}
                  {mapLayerSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {mapLayerSources.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No map layer topics available
              </span>
            )}
          </div>

          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Cameras
            </Text>
            {cameraSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {cameraTopics.length.toLocaleString()} of{" "}
                  {cameraSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {cameraSources.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                  <Checkbox
                    label="Show camera images"
                    checked={showCameraImages}
                    onChange={setShowCameraImages}
                    {...checkboxNoSpaceToggleProps}
                  />
                </div>
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No camera calibration topics available
              </span>
            )}
          </div>

          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Ego Pose
            </Text>
            {poseSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {poseTopics.length.toLocaleString()} of{" "}
                  {poseSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {poseSources.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                </div>
                {selectedPoseSources
                  .filter(
                    (s) =>
                      trajectories.get(s.id)?.status === "ready" &&
                      !trajectories.get(s.id)?.streamFrameId,
                  )
                  .map((s) => (
                    <FrameSelect
                      disabled={frameIds.length === 0}
                      key={s.id}
                      label={`Trajectory Frame (${s.label})`}
                      onChange={(frameId) =>
                        setTrajectoryFrameOverrides((current) => ({
                          ...current,
                          [s.id]: frameId,
                        }))
                      }
                      options={frameIds}
                      tooltip="This pose stream declares no coordinate frame; choose the frame its positions are expressed in."
                      value={trajectoryFrameByTopic.get(s.id) ?? ""}
                    />
                  ))}
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No pose topics available
              </span>
            )}
          </div>

          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              3D Labels
            </Text>
            {sceneAnnotationSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {sceneAnnotationTopics.length.toLocaleString()} of{" "}
                  {sceneAnnotationSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {sceneAnnotationSources.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No 3D label topics available
              </span>
            )}
          </div>

          <FrameSelect
            disabled={frameIds.length === 0}
            label="World Frame"
            onChange={updateWorldFrameId}
            options={frameIds}
            tooltip="Where everything exists. Data is transformed into this stable coordinate system before it is drawn."
            value={worldFrameId}
          />
          <FrameSelect
            disabled={frameIds.length === 0}
            label="Camera Target"
            onChange={updateCameraTargetFrameId}
            options={frameIds}
            tooltip="What the camera tracks. This changes your view, but it does not move data in the world."
            value={cameraTargetFrameId}
          />
          <TrackingModeSelect
            onChange={setTrackingMode}
            tooltip="How the camera follows the target frame during playback. Free leaves OrbitControls fully user-driven; follow modes preserve your current offset while tracking motion."
            value={trackingMode}
          />
        </div>
      </TileSettingsContent>
      {selectedTopics.length === 0 ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>No sources selected</span>
        </div>
      ) : pointCloudLayers.length > 0 ||
        sceneAnnotationLayers.length > 0 ||
        gridLayers.length > 0 ||
        cameraFrustumLayers.length > 0 ||
        panelWarning ? (
        <div className={styles.panelStack}>
          <PointCloudPanel
            annotationLayers={sceneAnnotationLayers}
            cameraPose={panelCameraPose}
            frustumLayers={frustumLayers}
            hudLines={hudLines}
            gridLayers={gridLayers}
            layers={pointCloudLayers}
            className={styles.panel}
            onCameraPoseChange={handleCameraPoseChange}
            onRenderStats={handlePanelRenderStats}
            warning={panelWarning}
          />
          <McapTileStatusBadge topics={selectedTopics} />
        </div>
      ) : (
        <McapTileEmptyState topics={selectedTopics} />
      )}
    </>
  );
};

function FrameSelect({
  disabled,
  label,
  onChange,
  options,
  tooltip,
  value,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly string[];
  readonly tooltip: string;
  readonly value: string;
}) {
  return (
    <label className={settingsStyles.field}>
      <SettingsLabel label={label} tooltip={tooltip} />
      <select
        aria-label={label}
        className={settingsStyles.select}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.length === 0 ? <option value="">No frames</option> : null}
        {options.length > 0 && !value ? (
          <option value="">Select frame</option>
        ) : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TrackingModeSelect({
  onChange,
  tooltip,
  value,
}: {
  readonly onChange: (value: Mcap3dTrackingMode) => void;
  readonly tooltip: string;
  readonly value: Mcap3dTrackingMode;
}) {
  return (
    <label className={settingsStyles.field}>
      <SettingsLabel label="Tracking Mode" tooltip={tooltip} />
      <select
        aria-label="Tracking Mode"
        className={settingsStyles.select}
        onChange={(event) => onChange(event.target.value as Mcap3dTrackingMode)}
        value={value}
      >
        {TRACKING_MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettingsLabel({
  label,
  tooltip,
}: {
  readonly label: string;
  readonly tooltip: string;
}) {
  return (
    <span className={settingsStyles.labelWithTooltip}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {label}
      </Text>
      <span
        aria-label={tooltip}
        className={settingsStyles.tooltipIcon}
        data-tooltip={tooltip}
        role="img"
        tabIndex={0}
      >
        ?
      </span>
    </span>
  );
}

function labelWithCount(label: string, count: number | undefined): string {
  return count !== undefined ? `${label} (${count.toLocaleString()})` : label;
}

function is3dRenderableSource(source: SceneSource): boolean {
  return (
    isPointCloudSource(source) ||
    isSceneAnnotationSource(source) ||
    isMapLayerSource(source) ||
    isCameraCalibrationSource(source) ||
    isPoseSource(source)
  );
}

function isPointCloudSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.POINT_CLOUD;
}

function isSceneAnnotationSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.SCENE_ANNOTATION;
}

function isMapLayerSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.MAP_LAYER;
}

function isCameraCalibrationSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.CAMERA_CALIBRATION;
}

function isPoseSource(source: SceneSource): boolean {
  return source.type === MCAP_SOURCE_TYPE.POSE;
}

function sortPointCloudSourcesForInitialPaint(
  sources: readonly SceneSource[],
): SceneSource[] {
  return sources
    .map((source, index) => ({
      index,
      score: provisionalPointCloudTopicScore(source),
      source,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ source }) => source);
}

function selectProvisionalPointCloudTopic(
  sources: readonly SceneSource[],
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
): string | null {
  let best: {
    readonly index: number;
    readonly score: number;
    readonly topic: string;
  } | null = null;

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (!source) {
      continue;
    }
    if (!frames[index]) {
      continue;
    }

    const score = provisionalPointCloudTopicScore(source);
    if (
      !best ||
      score > best.score ||
      (score === best.score && index < best.index)
    ) {
      best = {
        index,
        score,
        topic: source.id,
      };
    }
  }

  return best?.topic ?? sources[0]?.id ?? null;
}

function playbackFrameForTopic(
  selectedTopics: readonly string[],
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
  topic: string | null,
) {
  if (!topic) {
    return null;
  }

  const index = selectedTopics.indexOf(topic);
  return index >= 0 ? (frames[index] ?? null) : null;
}

function provisionalPointCloudTopicScore(source: SceneSource): number {
  const haystack = `${source.id} ${source.label}`.toLowerCase();
  let score = 0;

  for (const keyword of PROVISIONAL_TOPIC_KEYWORDS) {
    if (haystack.includes(keyword.value)) {
      score += keyword.score;
    }
  }
  for (const penalty of PROVISIONAL_TOPIC_PENALTIES) {
    if (haystack.includes(penalty.value)) {
      score += penalty.score;
    }
  }

  return score;
}

function resolveCameraTargetPose({
  cameraTargetFrameId,
  frameTransforms,
  playbackTimeNs,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly frameTransforms: McapFrameTransformsState;
  readonly playbackTimeNs: bigint | undefined;
  readonly worldFrameId: string;
}): CameraTargetResolution {
  if (!cameraTargetFrameId || !worldFrameId) {
    return { status: "pending" };
  }
  if (cameraTargetFrameId === worldFrameId) {
    return {
      pose: identityCameraTargetPose(),
      status: "resolved",
    };
  }
  if (playbackTimeNs === undefined) {
    return { status: "pending" };
  }

  const resolution = frameTransforms.resolve(
    cameraTargetFrameId,
    worldFrameId,
    playbackTimeNs,
  );
  if (resolution.status !== "resolved") {
    return { status: resolution.status };
  }

  return {
    pose: cameraTargetPoseFromFrameTransform(resolution.transform),
    status: "resolved",
  };
}

function trackingAnchorMatches({
  anchor,
  mode,
  targetFrameId,
  worldFrameId,
}: {
  readonly anchor: Mcap3dCameraTrackingAnchor | null;
  readonly mode: Exclude<Mcap3dTrackingMode, "free">;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    anchor?.mode === mode &&
    anchor.targetFrameId === targetFrameId &&
    anchor.worldFrameId === worldFrameId
  );
}

function cameraTrackingWarningText({
  cameraTargetFrameId,
  cameraTargetStatus,
  trackingMode,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly cameraTargetStatus: CameraTargetResolution["status"];
  readonly trackingMode: Mcap3dTrackingMode;
  readonly worldFrameId: string;
}) {
  if (
    !isFollowTrackingMode(trackingMode) ||
    cameraTargetStatus !== "missing" ||
    !cameraTargetFrameId ||
    !worldFrameId
  ) {
    return null;
  }

  return `Camera target transform unavailable: ${cameraTargetFrameId} to ${worldFrameId}`;
}

function joinWarnings(...warnings: readonly (string | null)[]) {
  const present = warnings.filter((warning): warning is string =>
    Boolean(warning),
  );
  return present.length > 0 ? present.join(" | ") : null;
}

function transformWarningText({
  clampedFrameIds,
  frameTransformsError,
  largeInterpolationGaps,
  unresolvedFrameIds,
  worldFrameId,
}: {
  readonly clampedFrameIds: readonly string[];
  readonly frameTransformsError: string | null;
  readonly largeInterpolationGaps: readonly Mcap3dTransformGapWarning[];
  readonly unresolvedFrameIds: readonly string[];
  readonly worldFrameId: string;
}) {
  if (frameTransformsError) {
    return `Frame transforms failed to load: ${frameTransformsError}`;
  }
  if (!worldFrameId) {
    return null;
  }

  const parts: string[] = [];
  if (unresolvedFrameIds.length > 0) {
    parts.push(
      `Missing transform to ${worldFrameId}: ${unresolvedFrameIds.join(", ")}`,
    );
  }
  if (clampedFrameIds.length > 0) {
    parts.push(
      `Using boundary-clamped transform to ${worldFrameId}: ${clampedFrameIds.join(
        ", ",
      )}`,
    );
  }
  if (largeInterpolationGaps.length > 0) {
    parts.push(
      `Interpolating transform across large gap to ${worldFrameId}: ${formatInterpolationGapWarnings(
        largeInterpolationGaps,
      )}`,
    );
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function frameIdsFromFrames(
  frames: readonly (McapTopicPlaybackFrame<PointCloudVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromGridFrames(
  frames: readonly (McapTopicPlaybackFrame<GridVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromCalibrationFrames(
  frames: readonly (McapTopicPlaybackFrame<CameraCalibrationVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    pushFrameId(frameIds, playbackFrame.frame.coordinateFrameId);
  }

  return frameIds;
}

function frameIdsFromSceneAnnotationFrames(
  frames: readonly (McapTopicPlaybackFrame<SceneUpdateVisualization> | null)[],
): readonly string[] {
  const frameIds: string[] = [];

  for (const playbackFrame of frames) {
    if (!playbackFrame) {
      continue;
    }
    for (const entity of playbackFrame.frame.entities) {
      pushFrameId(frameIds, entity.frameId);
    }
  }

  return frameIds;
}

function pushFrameId(frameIds: string[], frameId: string | undefined) {
  const normalized = frameId?.trim();
  if (normalized) {
    frameIds.push(normalized);
  }
}

function pointCountForLayers(
  layers: readonly {
    readonly frame: {
      readonly pointCount: number;
    };
  }[],
): number {
  return layers.reduce((sum, layer) => sum + layer.frame.pointCount, 0);
}

function transformCameraPose(
  pose: PointCloudCameraPose,
  transform: PointCloudFrameTransform,
): PointCloudCameraPose {
  return {
    position: transformCameraPosePoint(pose.position, transform),
    target: transformCameraPosePoint(pose.target, transform),
  };
}

function transformCameraPosePoint(
  point: PointCloudCameraPose["position"],
  transform: PointCloudFrameTransform,
): PointCloudCameraPose["position"] {
  const transformed = new Vector3(point[0], point[1], point[2]);
  const rotationLength = Math.hypot(
    transform.rotation.w,
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z,
  );
  if (rotationLength > 0) {
    transformed.applyQuaternion(transform.rotation.clone().normalize());
  }
  transformed.add(transform.translation);

  return [transformed.x, transformed.y, transformed.z];
}

function cameraPoseDebugDetail(pose: PointCloudCameraPose) {
  return {
    position: pose.position.map(roundDebugNumber),
    target: pose.target.map(roundDebugNumber),
  };
}

function roundDebugNumber(value: number): number {
  return Number(value.toFixed(3));
}

function uniqueSortedFrameIds(frameIds: readonly string[]): readonly string[] {
  return [...new Set(frameIds.map((id) => id.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function formatInterpolationGapWarnings(
  gaps: readonly Mcap3dTransformGapWarning[],
): string {
  return gaps
    .map(({ frameId, gapNs }) => `${frameId} (${formatNsDuration(gapNs)})`)
    .join(", ");
}

function formatNsDuration(value: bigint): string {
  const ms = Number(value) / 1_000_000;
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function msToNs(value: number): bigint {
  return BigInt(Math.max(0, Math.round(value))) * 1_000_000n;
}

function nextFrameSelection({
  allowFallback = true,
  current,
  frameIds,
  preferred,
  selectionSource,
}: {
  readonly allowFallback?: boolean;
  readonly current: string;
  readonly frameIds: readonly string[];
  readonly preferred: readonly string[];
  readonly selectionSource: FrameSelectionSource;
}) {
  if (selectionSource === "user" && current && frameIds.includes(current)) {
    return current;
  }

  for (const frameId of preferred) {
    if (frameId && frameIds.includes(frameId)) {
      return frameId;
    }
  }

  if (current && frameIds.includes(current)) {
    return current;
  }

  return allowFallback ? (frameIds[0] ?? "") : "";
}

export default Mcap3dTile;
