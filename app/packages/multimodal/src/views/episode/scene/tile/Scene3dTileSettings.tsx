import {
  Checkbox,
  FormField,
  Select,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ZIndex,
} from "@voxel51/voodo";
import type { Descriptor } from "@voxel51/voodo";
import React, { useMemo } from "react";
import type { DecodedDiagnostic } from "../../../../ir/index";
import type { SceneSource } from "../../../../scene-inventory/index";
import {
  isFollowTrackingMode,
  type Scene3dTrackingMode,
} from "../camera/scene-3d-camera";
import {
  DEFAULT_IMAGE_PROJECTION,
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
import { PointCloudStyleSection } from "./PointCloudStyleSection";
import type { PoseTrajectories } from "../entities/pose-trajectories-context";
import {
  checkboxNoSpaceToggleProps,
  settingsBooleanNoSpaceToggleProps,
} from "../../settings/controls/settings-keyboard";
import { FrameSelect } from "../../settings/controls/FrameSelect";
import { SettingsNumberField } from "../../settings/controls/SettingsNumberField";
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
  readonly selectedSources: readonly SceneSource[];
}

/** Image streams paired with the currently selected camera calibrations. */
export interface Scene3dTileSettingsCameraInputs {
  readonly diagnosticsByStream: readonly (readonly DecodedDiagnostic[])[];
  readonly imageStreams: readonly string[];
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
  const cameraSources = sourceGroups.camera.sources;
  const cameraStreams = sourceGroups.camera.streams;
  const cameraDetailsBySourceId = useMemo(
    () =>
      new Map(
        cameraStreams.map((stream, index) => [
          stream,
          (cameraInputs.diagnosticsByStream[index] ?? []).map(
            (diagnostic) => diagnostic.message,
          ),
        ]),
      ),
    [cameraInputs.diagnosticsByStream, cameraStreams],
  );
  const sceneAnnotationSources = sourceGroups.sceneAnnotation.sources;
  const sceneAnnotationStreams = sourceGroups.sceneAnnotation.streams;
  const poseSources = sourceGroups.pose.sources;
  const poseStreams = sourceGroups.pose.streams;
  const mapLayerSources = sourceGroups.mapLayer.sources;
  const mapLayerStreams = sourceGroups.mapLayer.streams;
  const pointCloudColorCapabilities = pointCloudInputs.colorCapabilities;
  const selectedPointCloudSources = pointCloudInputs.selectedSources;
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
        enabled={enabled}
        selectedCount={pointCloudStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={pointCloudSources}
        title="Point Clouds"
        toggleAriaLabel="Toggle point clouds"
        toggleSource={toggleSource}
      />

      {pointCloudSources.length > 0 ? (
        <PointCloudStyleSection
          pointCloudColorCapabilities={pointCloudColorCapabilities}
          pointCloudColors={pointCloudColors}
          pointCloudPointSize={pointCloudPointSize}
          pointCloudSources={pointCloudSources}
          selectedPointCloudSources={selectedPointCloudSources}
          setPointCloudColor={setPointCloudColor}
          setPointCloudPointSize={setPointCloudPointSize}
          setShowPointCloudColorLegend={setShowPointCloudColorLegend}
          showPointCloudColorLegend={showPointCloudColorLegend}
        />
      ) : null}

      <SourceGroup
        detailsBySourceId={cameraDetailsBySourceId}
        enabled={enabled}
        selectedCount={cameraStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={cameraSources}
        title="Cameras"
        toggleAriaLabel="Toggle cameras"
        toggleSource={toggleSource}
      />

      {cameraSources.length > 0 ? (
        <SidebarGroup
          defaultExpanded={false}
          summary={`${pinholeCamera.imagePlaneDepthM} m · ${pinholeCamera.opacityPercent}%`}
          title="Pinhole"
        >
          <SettingsNumberInput
            label="Depth (m)"
            max={100}
            min={0.05}
            onChange={(imagePlaneDepthM) =>
              setPinholeCamera({ imagePlaneDepthM })
            }
            step={0.25}
            tooltip="Distance from the optical center to the image plane. Larger depths render bigger camera frustums."
            value={pinholeCamera.imagePlaneDepthM}
          />
          <SettingsNumberInput
            label="Opacity (%)"
            max={100}
            min={0}
            onChange={(opacityPercent) => setPinholeCamera({ opacityPercent })}
            step={1}
            tooltip="Normal frustum and image-plane opacity. Hovered and focused frustums render fully opaque."
            value={pinholeCamera.opacityPercent}
          />
          {cameraStreams.map((cameraStream, index) => {
            const imageStream = cameraInputs.imageStreams[index];
            if (!imageStream) return null;
            const cameraLabel =
              cameraSources.find((source) => source.id === cameraStream)
                ?.label ?? "Unknown camera source";
            const geometry =
              imageProjectionSettings[imageStream]?.geometry ??
              DEFAULT_IMAGE_PROJECTION.geometry;
            return (
              <FormField
                key={cameraStream}
                label={
                  <SettingsLabel
                    label={`Geometry (${cameraLabel})`}
                    tooltip="Whether the recorded image uses the original distorted camera model or the rectified projection. This also controls the 3D frustum texture."
                  />
                }
                control={
                  <Select
                    aria-label={`Recorded image geometry (${cameraLabel})`}
                    exclusive
                    onChange={(value) => {
                      if (isImageGeometryMode(value)) {
                        setImageProjection(imageStream, { geometry: value });
                      }
                    }}
                    options={IMAGE_GEOMETRY_OPTIONS}
                    portal
                    zIndex={ZIndex.AboveModal}
                    value={geometry}
                  />
                }
              />
            );
          })}
        </SidebarGroup>
      ) : null}

      <SourceGroup
        enabled={enabled}
        selectedCount={sceneAnnotationStreams.length}
        setSourcesEnabled={setSourcesEnabled}
        sources={sceneAnnotationSources}
        title="3D Labels"
        toggleAriaLabel="Toggle 3D labels"
        toggleSource={toggleSource}
      />

      {sceneAnnotationSources.length > 0 ? (
        <SidebarGroup
          defaultExpanded={false}
          summary={smoothTrackedLabels ? "Smoothed" : "Recorded"}
          title="3D Label Playback"
        >
          <div className={settingsStyles.field}>
            <div className={settingsStyles.sectionHeader}>
              <SettingsLabel
                label="Smooth tracked 3D labels"
                tooltip="Interpolates compatible geometry only when consecutive entities share a stable ID and coordinate frame. Recorded labels remain held when matching is unsafe or the message gap is too large."
              />
              <Toggle
                aria-label="Smooth tracked 3D labels"
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
        </SidebarGroup>
      ) : null}

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

const IMAGE_GEOMETRY_OPTIONS: Descriptor<{ label: string }>[] = [
  { data: { label: "Auto (recommended)" }, id: "auto" },
  { data: { label: "Original camera" }, id: "original" },
  { data: { label: "Rectified" }, id: "rectified" },
];

function isImageGeometryMode(value: unknown): value is ImageGeometryMode {
  return value === "auto" || value === "original" || value === "rectified";
}

function SourceGroup({
  children,
  detailsBySourceId,
  enabled,
  selectedCount,
  setSourcesEnabled,
  sources,
  title,
  toggleAriaLabel,
  toggleSource,
}: {
  readonly children?: React.ReactNode;
  readonly detailsBySourceId?: ReadonlyMap<string, readonly string[]>;
  readonly enabled: ReadonlySet<string>;
  readonly selectedCount: number;
  readonly setSourcesEnabled: (
    ids: readonly string[],
    checked: boolean,
  ) => void;
  readonly sources: readonly SceneSource[];
  readonly title: string;
  readonly toggleAriaLabel: string;
  readonly toggleSource: (id: string, checked: boolean) => void;
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <SidebarGroup
      summary={`${selectedCount} of ${sources.length} on`}
      title={title}
      toggle={{
        ariaLabel: toggleAriaLabel,
        checked: selectedCount > 0,
        onChange: (checked) =>
          setSourcesEnabled(
            sources.map((s) => s.id),
            checked,
          ),
      }}
    >
      <div className={settingsStyles.optionStack}>
        {sources.map((s) => {
          const details = detailsBySourceId?.get(s.id) ?? [];
          return (
            <div key={s.id}>
              <Checkbox
                label={s.label}
                checked={enabled.has(s.id)}
                onChange={(checked) => toggleSource(s.id, checked)}
                {...checkboxNoSpaceToggleProps}
              />
              {details.map((detail, index) => (
                <Text
                  color={TextColor.Muted}
                  key={`${index}:${detail}`}
                  variant={TextVariant.Xs}
                >
                  {detail}
                </Text>
              ))}
            </div>
          );
        })}
      </div>
      {children}
    </SidebarGroup>
  );
}

function SettingsNumberInput({
  disabled,
  label,
  mapping,
  max,
  min,
  onChange,
  step,
  tooltip,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly mapping?: "linear" | "multiplicative";
  readonly max?: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly step: number;
  readonly tooltip?: string;
  readonly value: number;
}) {
  return (
    <label className={settingsStyles.field}>
      {tooltip ? (
        <SettingsLabel label={label} tooltip={tooltip} />
      ) : (
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {label}
        </Text>
      )}
      <SettingsNumberField
        ariaLabel={label}
        disabled={disabled}
        mapping={mapping}
        max={max}
        min={min}
        onCommit={onChange}
        step={step}
        value={value}
      />
    </label>
  );
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
