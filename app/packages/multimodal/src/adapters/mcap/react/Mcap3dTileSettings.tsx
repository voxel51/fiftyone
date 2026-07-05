import { TileSettingsContent } from "@fiftyone/tiling";
import {
  Checkbox,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import React from "react";
import type { SceneSource } from "../../../scene-inventory";
import {
  isFollowTrackingMode,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import type {
  McapPinholeCameraSettings,
  McapReferenceGridSettings,
  McapSceneBackgroundMode,
  McapSceneBackgroundSettings,
} from "./mcap-modal-settings";
import type { McapPoseTrajectories } from "./mcap-pose-trajectories-context";
import {
  checkboxNoSpaceToggleProps,
  settingsBooleanNoSpaceToggleProps,
} from "./mcap-settings-keyboard";
import McapSidebarGroup from "./McapSidebarGroup";
import settingsStyles from "./McapTile.settings.module.css";
import { TRACKING_MODES } from "./use-mcap-3d-camera-tracking";

export interface Mcap3dTileSettingsProps {
  readonly cameraSources: readonly SceneSource[];
  readonly cameraTargetFrameId: string;
  readonly cameraTopics: readonly string[];
  readonly enabled: ReadonlySet<string>;
  readonly frameIds: readonly string[];
  readonly mapLayerSources: readonly SceneSource[];
  readonly mapLayerTopics: readonly string[];
  readonly pinholeCamera: McapPinholeCameraSettings;
  readonly pointCloudSources: readonly SceneSource[];
  readonly pointCloudTopics: readonly string[];
  readonly poseSources: readonly SceneSource[];
  readonly poseTopics: readonly string[];
  readonly referenceGrid: McapReferenceGridSettings;
  readonly sceneAnnotationSources: readonly SceneSource[];
  readonly sceneAnnotationTopics: readonly string[];
  readonly sceneBackground: McapSceneBackgroundSettings;
  readonly selectedPoseSources: readonly SceneSource[];
  readonly setPinholeCamera: (
    settings: Partial<McapPinholeCameraSettings>,
  ) => void;
  readonly setReferenceGrid: (
    settings: Partial<McapReferenceGridSettings>,
  ) => void;
  readonly setSceneBackground: (
    settings: Partial<McapSceneBackgroundSettings>,
  ) => void;
  readonly setSourcesEnabled: (
    ids: readonly string[],
    checked: boolean,
  ) => void;
  readonly setTrackingMode: (mode: Mcap3dTrackingMode) => void;
  readonly setTrajectoryFrameOverrides: React.Dispatch<
    React.SetStateAction<Readonly<Record<string, string>>>
  >;
  readonly toggleSource: (id: string, checked: boolean) => void;
  readonly trackingMode: Mcap3dTrackingMode;
  readonly trajectories: McapPoseTrajectories;
  readonly trajectoryFrameByTopic: ReadonlyMap<string, string>;
  readonly updateCameraTargetFrameId: (frameId: string) => void;
  readonly updateWorldFrameId: (frameId: string) => void;
  readonly worldFrameId: string;
}

/**
 * Settings sidebar for the 3D tile. Unlike the image tile, sources are
 * multi-selectable — overlaying several sensors in one view is the point of
 * a 3D panel — so the sidebar offers per-source checkboxes grouped into
 * collapsible sections, each with a master on/off switch. Groups with no
 * available sources are hidden entirely. Pure presentational: all state
 * lives in the tile's hooks.
 */
const Mcap3dTileSettings: React.FC<Mcap3dTileSettingsProps> = ({
  cameraSources,
  cameraTargetFrameId,
  cameraTopics,
  enabled,
  frameIds,
  mapLayerSources,
  mapLayerTopics,
  pinholeCamera,
  pointCloudSources,
  pointCloudTopics,
  poseSources,
  poseTopics,
  referenceGrid,
  sceneAnnotationSources,
  sceneAnnotationTopics,
  sceneBackground,
  selectedPoseSources,
  setPinholeCamera,
  setReferenceGrid,
  setSceneBackground,
  setSourcesEnabled,
  setTrackingMode,
  setTrajectoryFrameOverrides,
  toggleSource,
  trackingMode,
  trajectories,
  trajectoryFrameByTopic,
  updateCameraTargetFrameId,
  updateWorldFrameId,
  worldFrameId,
}) => {
  return (
    <TileSettingsContent>
      <div className={settingsStyles.root}>
        <SourceGroup
          enabled={enabled}
          selectedCount={pointCloudTopics.length}
          setSourcesEnabled={setSourcesEnabled}
          sources={pointCloudSources}
          title="Point Clouds"
          toggleAriaLabel="Toggle point clouds"
          toggleSource={toggleSource}
        />

        <SourceGroup
          enabled={enabled}
          selectedCount={cameraTopics.length}
          setSourcesEnabled={setSourcesEnabled}
          sources={cameraSources}
          title="Cameras"
          toggleAriaLabel="Toggle cameras"
          toggleSource={toggleSource}
        />

        {cameraSources.length > 0 ? (
          <McapSidebarGroup
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
              onChange={(opacityPercent) =>
                setPinholeCamera({ opacityPercent })
              }
              step={1}
              tooltip="Normal frustum and image-plane opacity. Hovered and focused frustums render fully opaque."
              value={pinholeCamera.opacityPercent}
            />
          </McapSidebarGroup>
        ) : null}

        <SourceGroup
          enabled={enabled}
          selectedCount={sceneAnnotationTopics.length}
          setSourcesEnabled={setSourcesEnabled}
          sources={sceneAnnotationSources}
          title="3D Labels"
          toggleAriaLabel="Toggle 3D labels"
          toggleSource={toggleSource}
        />

        <SourceGroup
          enabled={enabled}
          selectedCount={poseTopics.length}
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
                value={trajectoryFrameByTopic.get(s.id) ?? ""}
              />
            ))}
        </SourceGroup>

        <SourceGroup
          enabled={enabled}
          selectedCount={mapLayerTopics.length}
          setSourcesEnabled={setSourcesEnabled}
          sources={mapLayerSources}
          title="Map Layers"
          toggleAriaLabel="Toggle map layers"
          toggleSource={toggleSource}
        />

        <McapSidebarGroup title="View">
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
            tooltip="How the camera follows the target frame during playback. Free leaves OrbitControls fully user-driven; follow modes preserve your current offset while tracking motion. Shortcuts: E = ego view, T = top view."
            value={trackingMode}
          />
          {isFollowTrackingMode(trackingMode) &&
          worldFrameId &&
          cameraTargetFrameId === worldFrameId ? (
            <span className={settingsStyles.emptyText}>
              The camera target and the world frame match, so follow modes
              change nothing: a frame cannot move relative to itself. Pick a
              global world frame (like map) to see the target move.
            </span>
          ) : null}
        </McapSidebarGroup>

        <McapSidebarGroup defaultExpanded={false} title="Appearance">
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
              onChange={(opacityPercent) =>
                setReferenceGrid({ opacityPercent })
              }
              step={1}
              value={referenceGrid.opacityPercent}
            />
          </div>

          <div className={settingsStyles.field}>
            <SettingsLabel
              label="Background"
              tooltip="Scene backdrop behind the 3D view: a solid color of your choice, or a named gradient — Abyss (dark) or Studio (light)."
            />
            <select
              aria-label="Background style"
              className={settingsStyles.select}
              onChange={(event) =>
                setSceneBackground({
                  mode: event.target.value as McapSceneBackgroundMode,
                })
              }
              value={sceneBackground.mode}
            >
              <option value="solid">Solid color</option>
              <option value="abyss">Abyss</option>
              <option value="studio">Studio</option>
            </select>
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
          </div>
        </McapSidebarGroup>
      </div>
    </TileSettingsContent>
  );
};

function SourceGroup({
  children,
  enabled,
  selectedCount,
  setSourcesEnabled,
  sources,
  title,
  toggleAriaLabel,
  toggleSource,
}: {
  readonly children?: React.ReactNode;
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
    <McapSidebarGroup
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
        {sources.map((s) => (
          <Checkbox
            key={s.id}
            label={s.label}
            checked={enabled.has(s.id)}
            onChange={(checked) => toggleSource(s.id, checked)}
            {...checkboxNoSpaceToggleProps}
          />
        ))}
      </div>
      {children}
    </McapSidebarGroup>
  );
}

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

function SettingsNumberInput({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  tooltip,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
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
      <input
        aria-label={label}
        className={settingsStyles.select}
        disabled={Boolean(disabled)}
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
        step={step}
        type="number"
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

export default Mcap3dTileSettings;
