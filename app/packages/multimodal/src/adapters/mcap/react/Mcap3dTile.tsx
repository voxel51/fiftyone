import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import {
  Checkbox,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  PointCloudPanel,
  type PointCloudCameraPose,
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
const EMPTY_3D_LAYER_STATE = {
  clampedFrameIds: [],
  largeInterpolationGaps: [],
  pointCloudLayers: [],
  unresolvedFrameIds: [],
} as const;

type FrameSelectionSource = "auto" | "user";
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
  const frameTransforms = useMcapFrameTransformsContext();
  const { temporalPolicy } = useMcapModalSettings();
  const setTileTitle = useSetTileTitle();
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

  // Selection in inventory order, so layers and statuses stay deterministic
  // regardless of the order sources were toggled in.
  const selectedSources = useMemo(
    () => renderableSources.filter((s) => enabled.has(s.id)),
    [renderableSources, enabled],
  );
  const selectedTopics = useMemo(
    () => selectedSources.map((s) => s.id),
    [selectedSources],
  );
  const frames =
    useMcapTopicPlaybackFrames<PointCloudVisualization>(selectedTopics);
  const playbackTimeNs = useMcapPlaybackTimeNs();
  const frameIds = useMemo(
    () =>
      uniqueSortedFrameIds([
        ...frameTransforms.frameIds,
        ...frameIdsFromFrames(frames),
      ]),
    [frameTransforms.frameIds, frames],
  );

  // This effect keeps the world frame on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setWorldFrameId((current) =>
      nextFrameSelection({
        current,
        frameIds,
        preferred: PREFERRED_WORLD_FRAMES,
        selectionSource: worldFrameSelectionSource,
      }),
    );
  }, [frameIds, worldFrameSelectionSource]);

  // This effect keeps the camera target on a preferred default until the user
  // explicitly chooses a frame.
  useEffect(() => {
    setCameraTargetFrameId((current) =>
      nextFrameSelection({
        current,
        frameIds,
        preferred: [...PREFERRED_CAMERA_TARGET_FRAMES, worldFrameId],
        selectionSource: cameraTargetSelectionSource,
      }),
    );
  }, [cameraTargetSelectionSource, frameIds, worldFrameId]);

  // This effect syncs the tile title with the current 3D source selection.
  useEffect(() => {
    const label =
      selectedTopics.length === 1
        ? renderableSources.find((s) => s.id === selectedTopics[0])?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL);
  }, [selectedTopics, renderableSources, setTileTitle]);

  const hasCoordinateFrame = useMemo(
    () =>
      frames.some((playbackFrame) => playbackFrame?.frame.coordinateFrameId),
    [frames],
  );
  const waitingForFrameTransforms =
    frameTransforms.status === "loading" && hasCoordinateFrame;
  const {
    clampedFrameIds,
    largeInterpolationGaps,
    pointCloudLayers,
    unresolvedFrameIds,
  } = useMemo(() => {
    if (waitingForFrameTransforms) {
      return EMPTY_3D_LAYER_STATE;
    }

    return build3dLayers({
      frameTransforms,
      frames,
      largeInterpolationGapWarningNs: msToNs(
        temporalPolicy.transformGapWarningMs,
      ),
      selectedTopics,
      worldFrameId,
    });
  }, [
    frameTransforms,
    frames,
    selectedTopics,
    temporalPolicy.transformGapWarningMs,
    waitingForFrameTransforms,
    worldFrameId,
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
    () => joinWarnings(transformWarning, cameraTrackingWarning),
    [cameraTrackingWarning, transformWarning],
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
    (pose: PointCloudCameraPose) => {
      setCameraPose(pose);
      latestCameraPoseRef.current = pose;
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
    [cameraTargetFrameId, cameraTargetPose, followTrackingMode, worldFrameId],
  );

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Sources
            </Text>
            {renderableSources.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {selectedTopics.length.toLocaleString()} of{" "}
                  {renderableSources.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {renderableSources.map((s) => (
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
                No 3D sources available
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
      ) : waitingForFrameTransforms ? (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      ) : pointCloudLayers.length > 0 || panelWarning ? (
        <div className={styles.panelStack}>
          <PointCloudPanel
            cameraPose={controlledCameraPose}
            layers={pointCloudLayers}
            className={styles.panel}
            onCameraPoseChange={handleCameraPoseChange}
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
  return source.type === MCAP_SOURCE_TYPE.POINT_CLOUD;
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

function pushFrameId(frameIds: string[], frameId: string | undefined) {
  const normalized = frameId?.trim();
  if (normalized) {
    frameIds.push(normalized);
  }
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
  current,
  frameIds,
  preferred,
  selectionSource,
}: {
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

  return frameIds[0] ?? "";
}

export default Mcap3dTile;
