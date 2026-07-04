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
import type { McapPoseTrajectories } from "./mcap-pose-trajectories-context";
import {
  checkboxNoSpaceToggleProps,
  settingsBooleanNoSpaceToggleProps,
} from "./mcap-settings-keyboard";
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
  readonly pointCloudSources: readonly SceneSource[];
  readonly pointCloudTopics: readonly string[];
  readonly poseSources: readonly SceneSource[];
  readonly poseTopics: readonly string[];
  readonly sceneAnnotationSources: readonly SceneSource[];
  readonly sceneAnnotationTopics: readonly string[];
  readonly selectedPoseSources: readonly SceneSource[];
  readonly setCameraSourcesEnabled: (checked: boolean) => void;
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
 * a 3D panel — so the sidebar offers checkboxes and panel-specific frame
 * controls. Pure presentational: all state lives in the tile's hooks.
 */
const Mcap3dTileSettings: React.FC<Mcap3dTileSettingsProps> = ({
  cameraSources,
  cameraTargetFrameId,
  cameraTopics,
  enabled,
  frameIds,
  mapLayerSources,
  mapLayerTopics,
  pointCloudSources,
  pointCloudTopics,
  poseSources,
  poseTopics,
  sceneAnnotationSources,
  sceneAnnotationTopics,
  selectedPoseSources,
  setCameraSourcesEnabled,
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
          <div className={settingsStyles.sectionHeader}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Cameras
            </Text>
            {cameraSources.length > 0 ? (
              <Toggle
                aria-label="Toggle cameras"
                checked={cameraTopics.length > 0}
                onChange={setCameraSourcesEnabled}
                size={Size.Sm}
                {...settingsBooleanNoSpaceToggleProps}
              />
            ) : null}
          </div>
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
          tooltip="How the camera follows the target frame during playback. Free leaves OrbitControls fully user-driven; follow modes preserve your current offset while tracking motion. Shortcuts: E = ego view, T = top view."
          value={trackingMode}
        />
        {isFollowTrackingMode(trackingMode) &&
        worldFrameId &&
        cameraTargetFrameId === worldFrameId ? (
          <span className={settingsStyles.emptyText}>
            The camera target and the world frame match, so follow modes change
            nothing: a frame cannot move relative to itself. Pick a global world
            frame (like map) to see the target move.
          </span>
        ) : null}
      </div>
    </TileSettingsContent>
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

export default Mcap3dTileSettings;
