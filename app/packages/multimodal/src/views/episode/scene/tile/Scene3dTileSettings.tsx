import {
  Checkbox,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import React, { useMemo, useState, useSyncExternalStore } from "react";
import type { SceneSource } from "../../../../scene-inventory/index";
import {
  isFollowTrackingMode,
  type Scene3dTrackingMode,
} from "../camera/scene-3d-camera";
import {
  DEFAULT_IMAGE_PROJECTION,
  defaultPointCloudColorForSource,
  type SceneBackgroundMode,
  usePinholeCameraSettings,
  useImageProjectionSettingsByStream,
  usePointCloudStyleSettings,
  useReferenceGridSettings,
  useSceneBackgroundSettings,
  useSetImageProjection,
} from "../../settings/modal/state";
import type { ImageGeometryMode } from "../../spatial/camera-geometry/camera-model";
import type { PointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";
import {
  isDefaultPointCloudColorSettings,
  PointCloudDisplayControls,
  PointCloudStyleButton,
  PointCloudStyleEditor,
} from "./PointCloudStyleSection";
import type { PoseTrajectories } from "../entities/pose-trajectories-context";
import { settingsBooleanNoSpaceToggleProps } from "../../settings/controls/settings-keyboard";
import { FrameSelect } from "../../settings/controls/FrameSelect";
import { SettingsNumberInput } from "../../settings/controls/SettingsNumberInput";
import { SettingsSelect } from "../../settings/controls/SettingsSelect";
import SidebarGroup from "../../settings/controls/SidebarGroup";
import settingsStyles from "../../tiles/Tile.settings.module.css";
import { SettingsLabel } from "../../settings/controls/SettingsLabel";
import ViewpointSettings from "../camera/ViewpointSettings";
import { TRACKING_MODES } from "../camera/use-scene-3d-camera-tracking";
import {
  useScene3dTilePlaybackSettings,
  useSetScene3dTilePlaybackSettings,
} from "./scene-3d-tile-state";
import {
  cameraSourceStatusDetails,
  type CameraSourceStatus,
} from "./camera-source-status";
import type { PointCloudCountStore } from "./point-cloud-count-store";

/**
 * One source group shown in the 3D settings sidebar.
 */
export interface Scene3dTileSettingsSourceGroup {
  readonly sources: readonly SceneSource[];
  readonly streams: readonly string[];
}

/**
 * Source groups available to the 3D settings sidebar.
 */
export interface Scene3dTileSettingsSourceGroups {
  readonly camera: Scene3dTileSettingsSourceGroup;
  readonly mapLayer: Scene3dTileSettingsSourceGroup;
  readonly pointCloud: Scene3dTileSettingsSourceGroup;
  readonly pose: Scene3dTileSettingsSourceGroup;
  readonly sceneAnnotation: Scene3dTileSettingsSourceGroup;
}

/**
 * Tile-local source selection controls for the 3D sidebar.
 */
export interface Scene3dTileSettingsSelectionControls {
  readonly enabled: ReadonlySet<string>;
  readonly setSourcesEnabled: (
    ids: readonly string[],
    checked: boolean,
  ) => void;
  readonly toggleSource: (id: string, checked: boolean) => void;
}

/**
 * Point-cloud inputs derived from the rendered 3D tile.
 */
export interface Scene3dTileSettingsPointCloudInputs {
  readonly colorCapabilities: ReadonlyMap<string, PointCloudColorCapabilities>;
  readonly pointCountStore: PointCloudCountStore;
  readonly selectedSources: readonly SceneSource[];
}

/** Image streams paired with the currently selected camera calibrations. */
export interface Scene3dTileSettingsCameraInputs {
  readonly imageStreams: readonly string[];
  readonly statusBySourceId: ReadonlyMap<string, CameraSourceStatus>;
}

/**
 * Camera-target frame controls owned by the 3D tile instance. The world
 * frame is scene-scoped and edited from the sidebar's Scene tab; its id is
 * carried here read-only so tracking copy can explain follow-mode no-ops.
 */
export interface Scene3dTileSettingsFrameControls {
  readonly cameraTargetFrameId: string;
  readonly frameIds: readonly string[];
  readonly updateCameraTargetFrameId: (frameId: string) => void;
  readonly worldFrameId: string;
}

/**
 * Pose trajectory controls owned by the 3D tile instance.
 */
export interface Scene3dTileSettingsPoseControls {
  readonly selectedSources: readonly SceneSource[];
  readonly setTrajectoryFrameOverrides: React.Dispatch<
    React.SetStateAction<Readonly<Record<string, string>>>
  >;
  readonly trajectories: PoseTrajectories;
  readonly trajectoryFrameByStream: ReadonlyMap<string, string>;
}

/**
 * Camera tracking controls owned by the 3D tile instance.
 */
export interface Scene3dTileSettingsTrackingControls {
  readonly mode: Scene3dTrackingMode;
  readonly setMode: (mode: Scene3dTrackingMode) => void;
}

/**
 * Grouped props for tile-local state consumed by the 3D settings sidebar.
 */
export interface Scene3dTileSettingsProps {
  readonly cameraInputs: Scene3dTileSettingsCameraInputs;
  readonly frameControls: Scene3dTileSettingsFrameControls;
  readonly pointCloudInputs: Scene3dTileSettingsPointCloudInputs;
  readonly poseControls: Scene3dTileSettingsPoseControls;
  readonly selection: Scene3dTileSettingsSelectionControls;
  readonly sourceGroups: Scene3dTileSettingsSourceGroups;
  readonly tileId: string | null;
  readonly trackingControls: Scene3dTileSettingsTrackingControls;
}

/**
 * Settings for one 3D view, registered into the sidebar's panel tab
 * (which frames it with the tile's stream-status strip). Everything here
 * answers "what does this window show": the view's camera (viewpoint +
 * tracking), which sources it draws, and its viewport appearance.
 * Scene-defining state — reference frame, up axis —
 * lives on the sidebar's Scene tab instead. Unlike the image tile, sources
 * are multi-selectable — overlaying several sensors in one view is the
 * point of a 3D panel — so per-source checkboxes group into collapsible
 * sections, each with a master on/off switch. Modal-wide preferences come
 * from domain hooks, tile-local controls arrive as grouped props, and
 * expanded editor state stays local to this component.
 */
const Scene3dTileSettings: React.FC<Scene3dTileSettingsProps> = ({
  cameraInputs,
  frameControls,
  pointCloudInputs,
  poseControls,
  selection,
  sourceGroups,
  tileId,
  trackingControls,
}) => {
  const { pinholeCamera, setPinholeCamera } = usePinholeCameraSettings();
  const imageProjectionSettings = useImageProjectionSettingsByStream();
  const setImageProjection = useSetImageProjection();
  const {
    pointCloudColors,
    pointCloudPointSize,
    setPointCloudColor,
    setPointCloudPointSize,
    setShowPointCloudColorLegend,
    showPointCloudColorLegend,
  } = usePointCloudStyleSettings();
  const { referenceGrid, setReferenceGrid } = useReferenceGridSettings();
  const { sceneBackground, setSceneBackground } = useSceneBackgroundSettings();
  const { smoothTrackedLabels } = useScene3dTilePlaybackSettings();
  const setScene3dTilePlaybackSettings = useSetScene3dTilePlaybackSettings();
  const { cameraTargetFrameId, frameIds, worldFrameId } = frameControls;
  const { enabled, setSourcesEnabled, toggleSource } = selection;
  const pointCloudSources = sourceGroups.pointCloud.sources;
  const pointCloudStreams = sourceGroups.pointCloud.streams;
  const selectedPointCloudSources = pointCloudInputs.selectedSources;
  const pointCloudLabelSuffixesBySourceId = new Map(
    pointCloudSources.map((source) => [
      source.id,
      <PointCloudCountLabel
        key={source.id}
        sourceId={source.id}
        store={pointCloudInputs.pointCountStore}
      />,
    ]),
  );
  const selectedPointCloudSourceIds = new Set(
    selectedPointCloudSources.map((source) => source.id),
  );
  const [expandedPointCloudSourceId, setExpandedPointCloudSourceId] = useState<
    string | null
  >(null);

  const pointCloudStyleBySourceId = new Map(
    pointCloudSources.map((source) => {
      const defaultSettings = defaultPointCloudColorForSource(
        source,
        pointCloudSources,
      );
      const settings = pointCloudColors[source.id] ?? defaultSettings;
      return [
        source.id,
        {
          customized: !isDefaultPointCloudColorSettings(
            settings,
            defaultSettings,
          ),
          defaultSettings,
          settings,
          source,
        },
      ] as const;
    }),
  );
  const styledPointCloudCount = [...pointCloudStyleBySourceId.values()].filter(
    ({ customized }) => customized,
  ).length;
  const pointCloudStyleControlsBySourceId = new Map(
    [...pointCloudStyleBySourceId].map(([sourceId, style]) => [
      sourceId,
      <PointCloudStyleButton
        customized={style.customized}
        disabled={!selectedPointCloudSourceIds.has(sourceId)}
        expanded={expandedPointCloudSourceId === sourceId}
        key={sourceId}
        onClick={() =>
          setExpandedPointCloudSourceId((current) =>
            current === sourceId ? null : sourceId,
          )
        }
        settings={style.settings}
        sourceLabel={style.source.label}
      />,
    ]),
  );
  const expandedPointCloudStyle = expandedPointCloudSourceId
    ? pointCloudStyleBySourceId.get(expandedPointCloudSourceId)
    : undefined;
  const pointCloudStyleContentBySourceId = new Map(
    expandedPointCloudSourceId && expandedPointCloudStyle
      ? [
          [
            expandedPointCloudSourceId,
            <PointCloudStyleEditor
              capabilities={pointCloudInputs.colorCapabilities.get(
                expandedPointCloudSourceId,
              )}
              customized={expandedPointCloudStyle.customized}
              defaultSettings={expandedPointCloudStyle.defaultSettings}
              key={expandedPointCloudSourceId}
              onChange={(patch) =>
                setPointCloudColor(expandedPointCloudSourceId, {
                  ...expandedPointCloudStyle.defaultSettings,
                  ...expandedPointCloudStyle.settings,
                  ...patch,
                })
              }
              onReset={() =>
                setPointCloudColor(
                  expandedPointCloudSourceId,
                  expandedPointCloudStyle.defaultSettings,
                )
              }
              settings={expandedPointCloudStyle.settings}
              sourceLabel={expandedPointCloudStyle.source.label}
            />,
          ] as const,
        ]
      : [],
  );
  const cameraSources = sourceGroups.camera.sources;
  const cameraStreams = sourceGroups.camera.streams;
  const cameraDetailsBySourceId = useMemo(
    () =>
      new Map(
        [...cameraInputs.statusBySourceId].map(([stream, status]) => [
          stream,
          cameraSourceStatusDetails(status),
        ]),
      ),
    [cameraInputs.statusBySourceId],
  );
  const unavailableCameraSourceIds = useMemo(
    () =>
      new Set(
        [...cameraInputs.statusBySourceId]
          .filter(([, status]) => status.calibration === "unavailable")
          .map(([stream]) => stream),
      ),
    [cameraInputs.statusBySourceId],
  );
  const cameraLabelsBySourceId = useMemo(
    () =>
      new Map(
        cameraSources.map((source) => [
          source.id,
          cameraDisplayLabel(source.label),
        ]),
      ),
    [cameraSources],
  );
  const cameraGeometryControlsBySourceId = new Map(
    cameraStreams.flatMap((cameraStream, index) => {
      if (unavailableCameraSourceIds.has(cameraStream)) return [];
      const imageStream = cameraInputs.imageStreams[index];
      if (!imageStream) return [];
      const cameraLabel =
        cameraLabelsBySourceId.get(cameraStream) ?? "Unknown camera";
      const geometry =
        imageProjectionSettings[imageStream]?.geometry ??
        DEFAULT_IMAGE_PROJECTION.geometry;
      return [
        [
          cameraStream,
          <label
            className={settingsStyles.cameraGeometryControl}
            key={cameraStream}
            title="How the recorded image maps onto the camera frustum"
          >
            <SettingsSelect
              ariaLabel={`Image geometry (${cameraLabel})`}
              onChange={(value) => {
                if (isImageGeometryMode(value)) {
                  setImageProjection(imageStream, { geometry: value });
                }
              }}
              options={IMAGE_GEOMETRY_OPTIONS}
              value={geometry}
            />
          </label>,
        ] as const,
      ];
    }),
  );
  const sceneAnnotationSources = sourceGroups.sceneAnnotation.sources;
  const sceneAnnotationStreams = sourceGroups.sceneAnnotation.streams;
  const poseSources = sourceGroups.pose.sources;
  const poseStreams = sourceGroups.pose.streams;
  const mapLayerSources = sourceGroups.mapLayer.sources;
  const mapLayerStreams = sourceGroups.mapLayer.streams;
  const selectedPoseSources = poseControls.selectedSources;
  const trackingMode = trackingControls.mode;
  const setTrackingMode = trackingControls.setMode;
  const { setTrajectoryFrameOverrides, trajectories, trajectoryFrameByStream } =
    poseControls;
  const { updateCameraTargetFrameId } = frameControls;

  return (
    <div className={settingsStyles.root}>
      <ViewpointSettings tileId={tileId} />

      <SidebarGroup title="Tracking">
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
          tooltip="How the camera follows the target frame during playback. Free leaves OrbitControls fully user-driven; follow modes preserve your current offset while tracking motion. Shortcuts: E = ego view, T = top view."
          value={trackingMode}
        />
        {isFollowTrackingMode(trackingMode) &&
        worldFrameId &&
        cameraTargetFrameId === worldFrameId ? (
          <span className={settingsStyles.emptyText}>
            The camera target and the reference frame match, so follow modes
            change nothing: a frame cannot move relative to itself. Pick a
            global reference frame (like map) on the Scene tab to see the target
            move.
          </span>
        ) : null}
      </SidebarGroup>

      <SourceGroup
        beforeSources={
          <PointCloudDisplayControls
            pointCloudPointSize={pointCloudPointSize}
            setPointCloudPointSize={setPointCloudPointSize}
            setShowPointCloudColorLegend={setShowPointCloudColorLegend}
            showPointCloudColorLegend={showPointCloudColorLegend}
          />
        }
        contentBySourceId={pointCloudStyleContentBySourceId}
        controlsBySourceId={pointCloudStyleControlsBySourceId}
        enabled={enabled}
        labelSuffixesBySourceId={pointCloudLabelSuffixesBySourceId}
        selectedCount={pointCloudStreams.length}
        setSourcesEnabled={(sourceIds, checked) => {
          if (!checked) setExpandedPointCloudSourceId(null);
          setSourcesEnabled(sourceIds, checked);
        }}
        sources={pointCloudSources}
        summary={`${pointCloudStreams.length} of ${pointCloudSources.length} on${styledPointCloudCount > 0 ? ` · ${styledPointCloudCount} styled` : ""}`}
        title="Point Clouds"
        toggleAriaLabel="Toggle point clouds"
        toggleSource={(sourceId, checked) => {
          if (!checked && expandedPointCloudSourceId === sourceId) {
            setExpandedPointCloudSourceId(null);
          }
          toggleSource(sourceId, checked);
        }}
      />

      <SourceGroup
        beforeSources={
          <div className={settingsStyles.sharedDisplayControls}>
            <SettingsNumberInput
              label="Frustum depth (m)"
              max={100}
              min={0.05}
              onChange={(imagePlaneDepthM) =>
                setPinholeCamera({ imagePlaneDepthM })
              }
              step={0.25}
              tooltip="Distance from the camera center to its image plane. Larger values draw a larger frustum."
              value={pinholeCamera.imagePlaneDepthM}
            />
            <SettingsNumberInput
              label="Frustum opacity (%)"
              max={100}
              min={0}
              onChange={(opacityPercent) =>
                setPinholeCamera({ opacityPercent })
              }
              step={1}
              tooltip="Opacity of camera frustums and image planes. Hovered and focused cameras remain fully opaque."
              value={pinholeCamera.opacityPercent}
            />
          </div>
        }
        controlsBySourceId={cameraGeometryControlsBySourceId}
        detailsBySourceId={cameraDetailsBySourceId}
        enabled={enabled}
        labelsBySourceId={cameraLabelsBySourceId}
        selectedCount={cameraStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={cameraSources}
        title="Cameras"
        toggleAriaLabel="Toggle cameras"
        toggleSource={toggleSource}
        unavailableSourceIds={unavailableCameraSourceIds}
      />

      <SourceGroup
        beforeSources={
          <div className={settingsStyles.field}>
            <div className={settingsStyles.sectionHeader}>
              <SettingsLabel
                label="Interpolate"
                tooltip="Interpolates compatible geometry only when consecutive entities share a stable ID and coordinate frame. Recorded labels remain held when matching is unsafe or the message gap is too large."
              />
              <Toggle
                aria-label="Interpolate"
                checked={smoothTrackedLabels}
                onChange={(checked) =>
                  setScene3dTilePlaybackSettings({
                    smoothTrackedLabels: checked,
                  })
                }
                size={Size.Sm}
                {...settingsBooleanNoSpaceToggleProps}
              />
            </div>
          </div>
        }
        enabled={enabled}
        selectedCount={sceneAnnotationStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={sceneAnnotationSources}
        title="3D Labels"
        toggleAriaLabel="Toggle 3D labels"
        toggleSource={toggleSource}
      />

      <SourceGroup
        enabled={enabled}
        selectedCount={poseStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={poseSources}
        title="Ego Pose"
        toggleAriaLabel="Toggle ego pose"
        toggleSource={toggleSource}
      >
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
              value={trajectoryFrameByStream.get(s.id) ?? ""}
            />
          ))}
      </SourceGroup>

      <SourceGroup
        enabled={enabled}
        selectedCount={mapLayerStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={mapLayerSources}
        title="Map Layers"
        toggleAriaLabel="Toggle map layers"
        toggleSource={toggleSource}
      />

      <SidebarGroup defaultExpanded={false} title="Appearance">
        <div className={settingsStyles.field}>
          <div className={settingsStyles.sectionHeader}>
            <SettingsLabel
              label="Reference Grid"
              tooltip="Adaptive grid on the world ground plane: minor lines at the configured spacing, brighter cardinal lines every tenth, coarsening by powers of ten as the camera recedes."
            />
            <Toggle
              aria-label="Toggle reference grid"
              checked={referenceGrid.enabled}
              onChange={(enabled) => setReferenceGrid({ enabled })}
              size={Size.Sm}
              {...settingsBooleanNoSpaceToggleProps}
            />
          </div>
          <SettingsNumberInput
            disabled={!referenceGrid.enabled}
            label="Spacing (m)"
            min={0.01}
            onChange={(spacingM) => setReferenceGrid({ spacingM })}
            step={0.5}
            value={referenceGrid.spacingM}
          />
          <SettingsNumberInput
            disabled={!referenceGrid.enabled}
            label="Opacity (%)"
            max={100}
            min={0}
            onChange={(opacityPercent) => setReferenceGrid({ opacityPercent })}
            step={1}
            value={referenceGrid.opacityPercent}
          />
        </div>

        <label className={settingsStyles.field}>
          <SettingsLabel
            label="Background"
            tooltip="Scene backdrop behind the 3D view: a solid color of your choice, or a named gradient — Abyss (dark) or Studio (light)."
          />
          <SettingsSelect
            ariaLabel="Background style"
            onChange={(mode) =>
              setSceneBackground({ mode: mode as SceneBackgroundMode })
            }
            options={SCENE_BACKGROUND_OPTIONS}
            value={sceneBackground.mode}
          />
          {sceneBackground.mode === "solid" ? (
            <input
              aria-label="Background color"
              className={settingsStyles.select}
              onChange={(event) =>
                setSceneBackground({ solidColor: event.target.value })
              }
              type="color"
              value={sceneBackground.solidColor}
            />
          ) : null}
        </label>
      </SidebarGroup>
    </div>
  );
};

const SCENE_BACKGROUND_OPTIONS = [
  { label: "Solid color", value: "solid" },
  { label: "Abyss", value: "abyss" },
  { label: "Studio", value: "studio" },
];

const IMAGE_GEOMETRY_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "Raw", value: "original" },
  { label: "Rectified", value: "rectified" },
];

function isImageGeometryMode(value: unknown): value is ImageGeometryMode {
  return value === "auto" || value === "original" || value === "rectified";
}

function SourceGroup({
  beforeSources,
  children,
  contentBySourceId,
  controlsBySourceId,
  detailsBySourceId,
  enabled,
  labelSuffixesBySourceId,
  labelsBySourceId,
  selectedCount,
  setSourcesEnabled,
  sources,
  summary: summaryOverride,
  title,
  toggleAriaLabel,
  toggleSource,
  unavailableSourceIds = EMPTY_SOURCE_IDS,
}: {
  readonly beforeSources?: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly contentBySourceId?: ReadonlyMap<string, React.ReactNode>;
  readonly controlsBySourceId?: ReadonlyMap<string, React.ReactNode>;
  readonly detailsBySourceId?: ReadonlyMap<string, readonly string[]>;
  readonly enabled: ReadonlySet<string>;
  readonly labelSuffixesBySourceId?: ReadonlyMap<string, React.ReactNode>;
  readonly labelsBySourceId?: ReadonlyMap<string, string>;
  readonly selectedCount: number;
  readonly setSourcesEnabled: (
    ids: readonly string[],
    checked: boolean,
  ) => void;
  readonly sources: readonly SceneSource[];
  readonly summary?: string;
  readonly title: string;
  readonly toggleAriaLabel: string;
  readonly toggleSource: (id: string, checked: boolean) => void;
  readonly unavailableSourceIds?: ReadonlySet<string>;
}) {
  if (sources.length === 0) {
    return null;
  }
  const unavailableCount = sources.filter((source) =>
    unavailableSourceIds.has(source.id),
  ).length;
  const issueCount = sources.filter(
    (source) => (detailsBySourceId?.get(source.id)?.length ?? 0) > 0,
  ).length;
  const defaultSummary = (() => {
    if (unavailableCount > 0) {
      return `${selectedCount} on · ${unavailableCount} unavailable`;
    }
    if (issueCount > 0) {
      return `${selectedCount} of ${sources.length} on · ${issueCount} ${issueCount === 1 ? "issue" : "issues"}`;
    }
    return `${selectedCount} of ${sources.length} on`;
  })();
  const summary = summaryOverride ?? defaultSummary;

  return (
    <SidebarGroup
      summary={summary}
      title={title}
      toggle={{
        ariaLabel: toggleAriaLabel,
        checked: selectedCount > 0,
        onChange: (checked) =>
          setSourcesEnabled(
            sources.map((source) => source.id),
            checked,
          ),
      }}
    >
      {beforeSources}
      <div className={settingsStyles.optionStack}>
        {sources.map((s) => {
          const details = detailsBySourceId?.get(s.id) ?? [];
          const checkbox = (
            <Checkbox
              label={labelsBySourceId?.get(s.id) ?? s.label}
              checked={enabled.has(s.id)}
              onChange={(checked) => toggleSource(s.id, checked)}
              {...settingsBooleanNoSpaceToggleProps}
            />
          );
          const labelSuffix = labelSuffixesBySourceId?.get(s.id);
          return (
            <div key={s.id}>
              <div className={settingsStyles.fieldRow}>
                {labelSuffix === undefined ? (
                  checkbox
                ) : (
                  <div className={settingsStyles.sourceSelection}>
                    {checkbox}
                    {labelSuffix}
                  </div>
                )}
                {controlsBySourceId?.get(s.id)}
              </div>
              {contentBySourceId?.get(s.id)}
              {details.map((detail, index) => (
                <div
                  className={settingsStyles.metaText}
                  key={`${index}:${detail}`}
                >
                  {detail}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {children}
    </SidebarGroup>
  );
}

const EMPTY_SOURCE_IDS: ReadonlySet<string> = new Set();

function PointCloudCountLabel({
  sourceId,
  store,
}: {
  readonly sourceId: string;
  readonly store: PointCloudCountStore;
}) {
  const pointCount = useSyncExternalStore(
    store.subscribe,
    () => store.getPointCount(sourceId),
    () => undefined,
  );

  return pointCount === undefined ? null : (
    <Text
      className={settingsStyles.sourceCount}
      color={TextColor.Secondary}
      variant={TextVariant.Xs}
    >
      ({pointCount.toLocaleString()})
    </Text>
  );
}

function cameraDisplayLabel(label: string): string {
  return label.replace(/^\//, "").replace(/\/camera_info$/i, "");
}

function TrackingModeSelect({
  onChange,
  tooltip,
  value,
}: {
  readonly onChange: (value: Scene3dTrackingMode) => void;
  readonly tooltip: string;
  readonly value: Scene3dTrackingMode;
}) {
  return (
    <label className={settingsStyles.field}>
      <SettingsLabel label="Tracking Mode" tooltip={tooltip} />
      <SettingsSelect
        ariaLabel="Tracking Mode"
        onChange={(value) => onChange(value as Scene3dTrackingMode)}
        options={TRACKING_MODES}
        value={value}
      />
    </label>
  );
}

// Memoized: the host tile re-renders per playback tick, but this settings
// tree has no per-tick inputs — the tile stabilizes the grouped props so
// ticks skip reconciling it.
export default React.memo(Scene3dTileSettings);
