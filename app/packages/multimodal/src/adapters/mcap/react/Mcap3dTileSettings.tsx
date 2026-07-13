import { Dialog } from "@fiftyone/components";
import {
  Button,
  Checkbox,
  FormField,
  FormFieldGroup,
  Input,
  InputType,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
  ZIndex,
} from "@voxel51/voodo";
import type { Descriptor } from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import type { DecodedDiagnostic } from "../../../decoders";
import type { SceneSource } from "../../../scene-inventory";
import {
  isFollowTrackingMode,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import {
  colormapCssGradient,
  POINT_CLOUD_COLORMAP_LABELS,
  POINT_CLOUD_COLORMAPS,
  DEFAULT_POINT_CLOUD_COLORMAP,
  getGradientFromSchemeName,
  getPointCloudColormapStops,
  interpolateHexColors,
  MAX_POINT_CLOUD_COLORMAP_STOPS,
  MIN_POINT_CLOUD_COLORMAP_STOPS,
  normalizeColorStops,
  normalizePointCloudColormap,
  pointCloudColormapKey,
  pointCloudColormapLabel,
  type PointCloudColorStop,
  type PointCloudColormap,
  type PointCloudColormapName,
} from "../../../visualization/panels/point-cloud";
import {
  DEFAULT_MCAP_IMAGE_PROJECTION,
  DEFAULT_MCAP_POINT_CLOUD_COLOR,
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  MCAP_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_MCAP_POINT_CLOUD_POINT_SIZE,
  defaultMcapPointCloudColorForSource,
  type McapPointCloudColorSettings,
  type McapSceneBackgroundMode,
  useMcapPinholeCameraSettings,
  useMcapImageProjectionSettingsByTopic,
  useMcapPointCloudStyleSettings,
  useMcapReferenceGridSettings,
  useMcapSceneBackgroundSettings,
  useSetMcapImageProjection,
} from "./mcap-modal-settings";
import type { McapImageGeometryMode } from "./camera-geometry/mcap-camera-model";
import type { PointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";
import type { McapPoseTrajectories } from "./mcap-pose-trajectories-context";
import {
  checkboxNoSpaceToggleProps,
  settingsBooleanNoSpaceToggleProps,
} from "./mcap-settings-keyboard";
import { McapFrameSelect } from "./McapFrameSelect";
import McapSidebarGroup from "./McapSidebarGroup";
import settingsStyles from "./McapTile.settings.module.css";
import { McapSettingsLabel as SettingsLabel } from "./McapSettingsLabel";
import { McapTileStreamNoticeStrip } from "./McapTileStreamState";
import McapViewpointSettings from "./McapViewpointSettings";
import { TRACKING_MODES } from "./use-mcap-3d-camera-tracking";

/**
 * One source group shown in the 3D settings sidebar.
 */
export interface Mcap3dTileSettingsSourceGroup {
  readonly sources: readonly SceneSource[];
  readonly topics: readonly string[];
}

/**
 * Source groups available to the 3D settings sidebar.
 */
export interface Mcap3dTileSettingsSourceGroups {
  readonly camera: Mcap3dTileSettingsSourceGroup;
  readonly mapLayer: Mcap3dTileSettingsSourceGroup;
  readonly pointCloud: Mcap3dTileSettingsSourceGroup;
  readonly pose: Mcap3dTileSettingsSourceGroup;
  readonly sceneAnnotation: Mcap3dTileSettingsSourceGroup;
}

/**
 * Tile-local source selection controls for the 3D sidebar.
 */
export interface Mcap3dTileSettingsSelectionControls {
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
export interface Mcap3dTileSettingsPointCloudInputs {
  readonly colorCapabilities: ReadonlyMap<string, PointCloudColorCapabilities>;
  readonly selectedSources: readonly SceneSource[];
}

/** Image topics paired with the currently selected camera calibrations. */
export interface Mcap3dTileSettingsCameraInputs {
  readonly diagnosticsByTopic: readonly (readonly DecodedDiagnostic[])[];
  readonly imageTopics: readonly string[];
}

/**
 * Camera-target frame controls owned by the 3D tile instance. The world
 * frame is scene-scoped and edited from the sidebar's Scene tab; its id is
 * carried here read-only so tracking copy can explain follow-mode no-ops.
 */
export interface Mcap3dTileSettingsFrameControls {
  readonly cameraTargetFrameId: string;
  readonly frameIds: readonly string[];
  readonly updateCameraTargetFrameId: (frameId: string) => void;
  readonly worldFrameId: string;
}

/**
 * Pose trajectory controls owned by the 3D tile instance.
 */
export interface Mcap3dTileSettingsPoseControls {
  readonly selectedSources: readonly SceneSource[];
  readonly setTrajectoryFrameOverrides: React.Dispatch<
    React.SetStateAction<Readonly<Record<string, string>>>
  >;
  readonly trajectories: McapPoseTrajectories;
  readonly trajectoryFrameByTopic: ReadonlyMap<string, string>;
}

/**
 * Camera tracking controls owned by the 3D tile instance.
 */
export interface Mcap3dTileSettingsTrackingControls {
  readonly mode: Mcap3dTrackingMode;
  readonly setMode: (mode: Mcap3dTrackingMode) => void;
}

/**
 * Grouped props for tile-local state consumed by the 3D settings sidebar.
 */
export interface Mcap3dTileSettingsProps {
  readonly cameraInputs: Mcap3dTileSettingsCameraInputs;
  readonly frameControls: Mcap3dTileSettingsFrameControls;
  readonly pointCloudInputs: Mcap3dTileSettingsPointCloudInputs;
  readonly poseControls: Mcap3dTileSettingsPoseControls;
  readonly selectedTopics: readonly string[];
  readonly selection: Mcap3dTileSettingsSelectionControls;
  readonly sourceGroups: Mcap3dTileSettingsSourceGroups;
  readonly tileId: string | null;
  readonly trackingControls: Mcap3dTileSettingsTrackingControls;
}

/**
 * Settings for one 3D view, registered into the sidebar's panel tab.
 * Everything here answers "what does this window show": the tile's stream
 * status, its camera (viewpoint + tracking), which sources it draws, and
 * its viewport appearance. Scene-defining state — reference frame, up axis —
 * lives on the sidebar's Scene tab instead. Unlike the image tile, sources
 * are multi-selectable — overlaying several sensors in one view is the
 * point of a 3D panel — so per-source checkboxes group into collapsible
 * sections, each with a master on/off switch. Modal-wide preferences come
 * from domain hooks, tile-local controls arrive as grouped props, and
 * expanded editor state stays local to this component.
 */
const Mcap3dTileSettings: React.FC<Mcap3dTileSettingsProps> = ({
  cameraInputs,
  frameControls,
  pointCloudInputs,
  poseControls,
  selectedTopics,
  selection,
  sourceGroups,
  tileId,
  trackingControls,
}) => {
  const { pinholeCamera, setPinholeCamera } = useMcapPinholeCameraSettings();
  const imageProjectionSettings = useMcapImageProjectionSettingsByTopic();
  const setImageProjection = useSetMcapImageProjection();
  const {
    pointCloudColors,
    pointCloudPointSize,
    setPointCloudColor,
    setPointCloudPointSize,
    setShowPointCloudColorLegend,
    showPointCloudColorLegend,
  } = useMcapPointCloudStyleSettings();
  const { referenceGrid, setReferenceGrid } = useMcapReferenceGridSettings();
  const { sceneBackground, setSceneBackground } =
    useMcapSceneBackgroundSettings();
  const { cameraTargetFrameId, frameIds, worldFrameId } = frameControls;
  const { enabled, setSourcesEnabled, toggleSource } = selection;
  const pointCloudSources = sourceGroups.pointCloud.sources;
  const pointCloudTopics = sourceGroups.pointCloud.topics;
  const cameraSources = sourceGroups.camera.sources;
  const cameraTopics = sourceGroups.camera.topics;
  const cameraDetailsBySourceId = useMemo(
    () =>
      new Map(
        cameraTopics.map((topic, index) => [
          topic,
          (cameraInputs.diagnosticsByTopic[index] ?? []).map(
            (diagnostic) => diagnostic.message,
          ),
        ]),
      ),
    [cameraInputs.diagnosticsByTopic, cameraTopics],
  );
  const sceneAnnotationSources = sourceGroups.sceneAnnotation.sources;
  const sceneAnnotationTopics = sourceGroups.sceneAnnotation.topics;
  const poseSources = sourceGroups.pose.sources;
  const poseTopics = sourceGroups.pose.topics;
  const mapLayerSources = sourceGroups.mapLayer.sources;
  const mapLayerTopics = sourceGroups.mapLayer.topics;
  const pointCloudColorCapabilities = pointCloudInputs.colorCapabilities;
  const selectedPointCloudSources = pointCloudInputs.selectedSources;
  const selectedPoseSources = poseControls.selectedSources;
  const trackingMode = trackingControls.mode;
  const setTrackingMode = trackingControls.setMode;
  const { setTrajectoryFrameOverrides, trajectories, trajectoryFrameByTopic } =
    poseControls;
  const { updateCameraTargetFrameId } = frameControls;

  return (
    <div className={settingsStyles.root}>
      <McapTileStreamNoticeStrip topics={selectedTopics} />

      <McapViewpointSettings tileId={tileId} />

      <McapSidebarGroup title="Tracking">
        <McapFrameSelect
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
      </McapSidebarGroup>

      <SourceGroup
        enabled={enabled}
        selectedCount={pointCloudTopics.length}
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
            onChange={(opacityPercent) => setPinholeCamera({ opacityPercent })}
            step={1}
            tooltip="Normal frustum and image-plane opacity. Hovered and focused frustums render fully opaque."
            value={pinholeCamera.opacityPercent}
          />
          {cameraTopics.map((cameraTopic, index) => {
            const imageTopic = cameraInputs.imageTopics[index];
            if (!imageTopic) return null;
            const cameraLabel =
              cameraSources.find((source) => source.id === cameraTopic)
                ?.label ?? cameraTopic;
            const geometry =
              imageProjectionSettings[imageTopic]?.geometry ??
              DEFAULT_MCAP_IMAGE_PROJECTION.geometry;
            return (
              <FormField
                key={cameraTopic}
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
                      if (isMcapImageGeometryMode(value)) {
                        setImageProjection(imageTopic, { geometry: value });
                      }
                    }}
                    options={MCAP_IMAGE_GEOMETRY_OPTIONS}
                    portal
                    zIndex={ZIndex.AboveModal}
                    value={geometry}
                  />
                }
              />
            );
          })}
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
            <McapFrameSelect
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
            onChange={(opacityPercent) => setReferenceGrid({ opacityPercent })}
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
  );
};

const MCAP_IMAGE_GEOMETRY_OPTIONS: Descriptor<{ label: string }>[] = [
  { data: { label: "Auto (recommended)" }, id: "auto" },
  { data: { label: "Original camera" }, id: "original" },
  { data: { label: "Rectified" }, id: "rectified" },
];

function isMcapImageGeometryMode(
  value: unknown,
): value is McapImageGeometryMode {
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
    </McapSidebarGroup>
  );
}

function PointCloudStyleSection({
  pointCloudColorCapabilities,
  pointCloudColors,
  pointCloudPointSize,
  pointCloudSources,
  selectedPointCloudSources,
  setPointCloudColor,
  setPointCloudPointSize,
  setShowPointCloudColorLegend,
  showPointCloudColorLegend,
}: {
  readonly pointCloudColorCapabilities: ReadonlyMap<
    string,
    PointCloudColorCapabilities
  >;
  readonly pointCloudColors: Record<string, McapPointCloudColorSettings>;
  readonly pointCloudPointSize: number;
  readonly pointCloudSources: readonly SceneSource[];
  readonly selectedPointCloudSources: readonly SceneSource[];
  readonly setPointCloudColor: (
    topic: string,
    settings: Partial<McapPointCloudColorSettings>,
  ) => void;
  readonly setPointCloudPointSize: (pointSize: number) => void;
  readonly setShowPointCloudColorLegend: (visible: boolean) => void;
  readonly showPointCloudColorLegend: boolean;
}) {
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const summary = `${pointCloudPointSize}px · ${
    showPointCloudColorLegend ? "legend on" : "legend off"
  } · ${selectedPointCloudSources.length} active`;

  // This effect closes details for a point cloud that is no longer selected.
  useEffect(() => {
    if (
      expandedSourceId &&
      !selectedPointCloudSources.some(
        (source) => source.id === expandedSourceId,
      )
    ) {
      setExpandedSourceId(null);
    }
  }, [expandedSourceId, selectedPointCloudSources]);

  return (
    <McapSidebarGroup
      defaultExpanded={false}
      summary={summary}
      title="Point Clouds (Style)"
    >
      <SettingsNumberInput
        label="Point size"
        max={MAX_MCAP_POINT_CLOUD_POINT_SIZE}
        min={MIN_MCAP_POINT_CLOUD_POINT_SIZE}
        onChange={setPointCloudPointSize}
        step={MCAP_POINT_CLOUD_POINT_SIZE_STEP}
        tooltip="Global point sprite size in screen pixels for all point clouds in this 3D view."
        value={pointCloudPointSize}
      />
      <div className={settingsStyles.field}>
        <div className={settingsStyles.sectionHeader}>
          <SettingsLabel
            label="Show color legend"
            tooltip="Shows the active scalar color ramps in the top-left of the 3D view."
          />
          <Toggle
            aria-label="Show point cloud color legend"
            checked={showPointCloudColorLegend}
            onChange={setShowPointCloudColorLegend}
            size={Size.Sm}
            {...settingsBooleanNoSpaceToggleProps}
          />
        </div>
      </div>
      {selectedPointCloudSources.length > 0 ? (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <div className={settingsStyles.colorSourceList}>
            {selectedPointCloudSources.map((source) => {
              const defaultSettings = defaultMcapPointCloudColorForSource(
                source,
                pointCloudSources,
              );
              const settings = pointCloudColors[source.id] ?? defaultSettings;
              const expanded = expandedSourceId === source.id;
              const customized = !isDefaultPointCloudColorSettings(
                settings,
                defaultSettings,
              );
              return (
                <div className={settingsStyles.colorSourceItem} key={source.id}>
                  <div className={settingsStyles.colorSourceRow}>
                    <button
                      aria-expanded={expanded}
                      aria-label={`Edit color for ${source.label}`}
                      className={settingsStyles.colorSourceSummary}
                      onClick={() =>
                        setExpandedSourceId(expanded ? null : source.id)
                      }
                      type="button"
                    >
                      <span className={settingsStyles.colorSourceName}>
                        {source.label}
                      </span>
                      <PointCloudColorSummary settings={settings} />
                      <span className={settingsStyles.colorChip}>
                        {customized ? "Override" : "Default"}
                      </span>
                    </button>
                    <Button
                      aria-label={`Reset color for ${source.label}`}
                      disabled={!customized}
                      onClick={() =>
                        setPointCloudColor(source.id, defaultSettings)
                      }
                      size={Size.Xs}
                      variant={Variant.Secondary}
                    >
                      Reset
                    </Button>
                  </div>
                  {expanded ? (
                    <div className={settingsStyles.colorSourceEditor}>
                      <PointCloudColorControls
                        capabilities={pointCloudColorCapabilities.get(
                          source.id,
                        )}
                        defaultColormap={defaultSettings.colormap}
                        onChange={(patch) =>
                          setPointCloudColor(source.id, {
                            ...defaultSettings,
                            ...settings,
                            ...patch,
                          })
                        }
                        settings={settings}
                        sourceLabel={source.label}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Stack>
      ) : (
        <span className={settingsStyles.emptyText}>
          Select a point cloud to configure its colors.
        </span>
      )}
    </McapSidebarGroup>
  );
}

// Color-by modes with fixed meanings; every other select value is a
// decoded scalar channel name.
const RESERVED_COLOR_BY_MODES: ReadonlySet<string> = new Set([
  "auto",
  "height",
  "rgb",
  "uniform",
]);

const CUSTOM_COLORMAP_SELECT_VALUE = "__custom__";

type SelectLabelDescriptor = Descriptor<{
  label: string;
  content?: React.ReactNode;
}>;

const COLORMAP_SELECT_OPTIONS: SelectLabelDescriptor[] = [
  ...POINT_CLOUD_COLORMAPS.map((colormap) => ({
    data: { label: POINT_CLOUD_COLORMAP_LABELS[colormap] },
    id: colormap,
  })),
  {
    data: { label: "Custom..." },
    id: CUSTOM_COLORMAP_SELECT_VALUE,
  },
];

const PRESET_COLORMAP_OPTIONS: SelectLabelDescriptor[] =
  POINT_CLOUD_COLORMAPS.map((colormap) => ({
    data: { label: POINT_CLOUD_COLORMAP_LABELS[colormap] },
    id: colormap,
  }));

type EditablePointCloudColorStop = PointCloudColorStop & {
  readonly id: string;
};

let nextPointCloudColorStopId = 0;

function PointCloudColorSummary({
  settings,
}: {
  readonly settings: McapPointCloudColorSettings;
}) {
  const rampActive =
    settings.colorBy !== "rgb" && settings.colorBy !== "uniform";
  const rangeLabel = pointCloudRangeLabel(settings);

  return (
    <span className={settingsStyles.colorSummaryChips}>
      <span className={settingsStyles.colorChip}>
        {pointCloudColorByLabel(settings.colorBy)}
      </span>
      {settings.colorBy === "uniform" ? (
        <span
          aria-label="Uniform color preview"
          className={settingsStyles.colorSourcePreview}
          style={{ background: settings.uniformColor }}
        />
      ) : null}
      {rampActive ? (
        <>
          <span
            aria-label="Colormap preview"
            className={settingsStyles.colorSourcePreview}
            style={{
              background: colormapCssGradient(
                normalizePointCloudColormap(settings.colormap),
              ),
            }}
          />
          <span className={settingsStyles.colorChip}>
            {pointCloudColormapLabel(settings.colormap)}
          </span>
        </>
      ) : null}
      {rangeLabel ? (
        <span className={settingsStyles.colorChip}>{rangeLabel}</span>
      ) : null}
    </span>
  );
}

function pointCloudColorByLabel(colorBy: string): string {
  switch (colorBy) {
    case "auto":
      return "Auto";
    case "height":
      return "Height";
    case "rgb":
      return "RGB";
    case "uniform":
      return "Uniform";
    default:
      return colorBy;
  }
}

function pointCloudRangeLabel({
  rangeMax,
  rangeMin,
}: McapPointCloudColorSettings): string | null {
  if (rangeMin === null && rangeMax === null) {
    return null;
  }

  return `${rangeMin ?? "auto"}..${rangeMax ?? "auto"}`;
}

function isDefaultPointCloudColorSettings(
  settings: McapPointCloudColorSettings,
  defaultSettings = DEFAULT_MCAP_POINT_CLOUD_COLOR,
): boolean {
  return (
    settings.colorBy === defaultSettings.colorBy &&
    pointCloudColormapKey(settings.colormap) ===
      pointCloudColormapKey(defaultSettings.colormap) &&
    settings.rangeMax === defaultSettings.rangeMax &&
    settings.rangeMin === defaultSettings.rangeMin &&
    settings.uniformColor === defaultSettings.uniformColor
  );
}

/**
 * Per-source point-cloud color controls: channel select, colormap, and an
 * optional fixed normalization range. Channel options are the channels the
 * topic has actually been observed to carry; a persisted selection that no
 * longer matches stays listed so the select reflects what is applied.
 */
function PointCloudColorControls({
  capabilities,
  defaultColormap = DEFAULT_POINT_CLOUD_COLORMAP,
  onChange,
  settings,
  sourceLabel,
}: {
  readonly capabilities?: PointCloudColorCapabilities;
  readonly defaultColormap?: PointCloudColormap;
  readonly onChange: (settings: Partial<McapPointCloudColorSettings>) => void;
  readonly settings: McapPointCloudColorSettings;
  readonly sourceLabel?: string;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const scalarFields = capabilities?.scalarFields;
  const fieldOptions = useMemo(() => {
    const fields = scalarFields ?? [];
    return !RESERVED_COLOR_BY_MODES.has(settings.colorBy) &&
      !fields.includes(settings.colorBy)
      ? [...fields, settings.colorBy]
      : fields;
  }, [scalarFields, settings.colorBy]);
  const label = sourceLabel ? `Color (${sourceLabel})` : "Color";
  const colorByOptions = useMemo<Descriptor<{ label: string }>[]>(
    () => [
      { data: { label: "Auto" }, id: "auto" },
      { data: { label: "Height" }, id: "height" },
      ...fieldOptions.map((field) => ({
        data: { label: field },
        id: field,
      })),
      ...(capabilities?.hasRgb ? [{ data: { label: "RGB" }, id: "rgb" }] : []),
      { data: { label: "Uniform" }, id: "uniform" },
    ],
    [capabilities?.hasRgb, fieldOptions],
  );
  const normalizedColormap = normalizePointCloudColormap(settings.colormap);
  const colormapSelectValue =
    typeof normalizedColormap === "string"
      ? normalizedColormap
      : CUSTOM_COLORMAP_SELECT_VALUE;
  const rampActive =
    settings.colorBy !== "rgb" && settings.colorBy !== "uniform";
  const uniformActive = settings.colorBy === "uniform";
  const rangeInvalid =
    settings.rangeMin !== null &&
    settings.rangeMax !== null &&
    settings.rangeMin >= settings.rangeMax;

  return (
    <div className={settingsStyles.field}>
      <FormField
        label={
          <SettingsLabel
            label={label}
            tooltip="Per-point channel driving this cloud's colors. Auto prefers explicit RGB, then sensor-return channels like intensity, then height."
          />
        }
        control={
          <Select
            aria-label={label}
            exclusive
            onChange={(value) => {
              if (typeof value === "string") {
                onChange({ colorBy: value });
              }
            }}
            options={colorByOptions}
            portal
            zIndex={ZIndex.AboveModal}
            value={settings.colorBy}
          />
        }
      />
      {uniformActive ? (
        <FormField
          label={
            <SettingsLabel
              label="Uniform color"
              tooltip="Single color applied to every rendered point in this cloud."
            />
          }
          control={
            <input
              aria-label={
                sourceLabel ? `Uniform color (${sourceLabel})` : "Uniform color"
              }
              className={settingsStyles.select}
              onChange={(event) =>
                onChange({ uniformColor: event.target.value })
              }
              type="color"
              value={
                settings.uniformColor ||
                DEFAULT_MCAP_POINT_CLOUD_COLOR.uniformColor
              }
            />
          }
        />
      ) : null}
      {rampActive ? (
        <FormFieldGroup orientation={Orientation.Column} spacing={Spacing.Sm}>
          <FormField
            label={
              <SettingsLabel
                label="Colormap"
                tooltip="Ramp mapping the selected channel's values to colors. Enable the legend to show the active ramp and range in the 3D view."
              />
            }
            control={
              <Select
                aria-label={
                  sourceLabel ? `Colormap (${sourceLabel})` : "Colormap"
                }
                exclusive
                onChange={(value) => {
                  if (value === CUSTOM_COLORMAP_SELECT_VALUE) {
                    setEditorOpen(true);
                    return;
                  }
                  if (typeof value === "string") {
                    onChange({
                      colormap: value as PointCloudColormapName,
                    });
                  }
                }}
                options={COLORMAP_SELECT_OPTIONS}
                portal
                zIndex={ZIndex.AboveModal}
                value={colormapSelectValue}
              />
            }
          />
          <div
            aria-label={`${label} colormap preview`}
            className={settingsStyles.colorPreview}
            style={{ background: colormapCssGradient(normalizedColormap) }}
          />
          <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
            <Button
              onClick={() => setEditorOpen(true)}
              size={Size.Xs}
              variant={Variant.Secondary}
            >
              Edit colormap
            </Button>
            <Button
              onClick={() => onChange({ colormap: defaultColormap })}
              size={Size.Xs}
              variant={Variant.Secondary}
            >
              Reset
            </Button>
          </Stack>
          <SettingsNullableNumberInput
            label="Range min"
            onChange={(rangeMin) => onChange({ rangeMin })}
            tooltip="Lower end of a fixed color range. Leave empty to normalize against each frame's own minimum."
            value={settings.rangeMin}
          />
          <SettingsNullableNumberInput
            label="Range max"
            onChange={(rangeMax) => onChange({ rangeMax })}
            tooltip="Upper end of a fixed color range. Leave empty to normalize against each frame's own maximum."
            value={settings.rangeMax}
          />
          {rangeInvalid ? (
            <span className={settingsStyles.emptyText}>
              The fixed range is ignored until min is below max.
            </span>
          ) : null}
          <PointCloudColormapEditor
            colormap={normalizedColormap}
            isOpen={editorOpen}
            onClose={() => setEditorOpen(false)}
            onSave={(colormap) => {
              onChange({ colormap });
              setEditorOpen(false);
            }}
            sourceLabel={sourceLabel}
          />
        </FormFieldGroup>
      ) : null}
    </div>
  );
}

function PointCloudColormapEditor({
  colormap,
  isOpen,
  onClose,
  onSave,
  sourceLabel,
}: {
  readonly colormap: PointCloudColormap;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (colormap: PointCloudColormap) => void;
  readonly sourceLabel?: string;
}) {
  const [edited, setEdited] = useState(false);
  const [numStops, setNumStops] = useState("");
  const [selectedPreset, setSelectedPreset] =
    useState<PointCloudColormapName | null>(null);
  const [stops, setStops] = useState<readonly EditablePointCloudColorStop[]>(
    [],
  );
  const title = `Colormap${sourceLabel ? ` (${sourceLabel})` : ""}`;

  // This effect seeds the editor whenever the colormap dialog opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const normalized = normalizePointCloudColormap(colormap);
    const normalizedStops = getPointCloudColormapStops(normalized);
    setSelectedPreset(typeof normalized === "string" ? normalized : null);
    setStops(editableColorStops(normalizedStops));
    setNumStops(String(normalizedStops.length));
    setEdited(false);
  }, [colormap, isOpen]);

  const normalizedStops = normalizeColorStops(stops) ?? [
    ...getGradientFromSchemeName(DEFAULT_POINT_CLOUD_COLORMAP),
  ];
  const stopCount = Number(numStops);
  const stopCountValid =
    Number.isInteger(stopCount) &&
    stopCount >= MIN_POINT_CLOUD_COLORMAP_STOPS &&
    stopCount <= MAX_POINT_CLOUD_COLORMAP_STOPS;

  const handlePresetChange = (value: string | string[] | null) => {
    if (typeof value !== "string") {
      return;
    }
    const preset = value as PointCloudColormapName;
    setSelectedPreset(preset);
    const nextStops = getGradientFromSchemeName(preset);
    setStops(editableColorStops(nextStops));
    setNumStops(String(nextStops.length));
    setEdited(false);
  };

  const updateStop = (index: number, patch: Partial<PointCloudColorStop>) => {
    setStops((current) =>
      current
        .map((stop, stopIndex) =>
          stopIndex === index ? { ...stop, ...patch } : stop,
        )
        .sort((a, b) => a.value - b.value),
    );
    setEdited(true);
  };

  const removeStop = (index: number) => {
    if (stops.length <= MIN_POINT_CLOUD_COLORMAP_STOPS) {
      return;
    }
    setStops((current) =>
      current.filter((_, stopIndex) => stopIndex !== index),
    );
    setEdited(true);
  };

  const addStop = () => {
    const sorted = [...stops].sort((a, b) => a.value - b.value);
    let insertIndex = 0;
    let largestGap = -1;
    for (let index = 0; index < sorted.length - 1; index++) {
      const gap = sorted[index + 1].value - sorted[index].value;
      if (gap > largestGap) {
        largestGap = gap;
        insertIndex = index;
      }
    }
    const lower = sorted[insertIndex];
    const upper = sorted[insertIndex + 1];
    const value = (lower.value + upper.value) / 2;
    const color = interpolateHexColors(lower.color, upper.color, 0.5);
    setStops(
      [
        ...sorted.slice(0, insertIndex + 1),
        editableColorStop({ color, value }),
        ...sorted.slice(insertIndex + 1),
      ].sort((a, b) => a.value - b.value),
    );
    setEdited(true);
  };

  const applyStopCount = () => {
    if (!stopCountValid) {
      return;
    }
    if (selectedPreset) {
      setStops(
        editableColorStops(
          getGradientFromSchemeName(selectedPreset, stopCount),
        ),
      );
    } else {
      setStops(
        editableColorStops(redistributeStops(normalizedStops, stopCount)),
      );
    }
    setEdited(true);
  };

  const save = () => {
    const list = normalizeColorStops(stops);
    if (!edited && selectedPreset) {
      onSave(selectedPreset);
      return;
    }
    if (list) {
      onSave({
        list,
        name: selectedPreset
          ? `${POINT_CLOUD_COLORMAP_LABELS[selectedPreset]} custom`
          : "Custom",
      });
    }
  };

  return (
    <Dialog
      id="mcapPointCloudColormapEditor"
      onClose={onClose}
      open={isOpen}
      style={{ zIndex: 2000 }}
    >
      <Stack
        className={settingsStyles.colormapEditor}
        orientation={Orientation.Column}
        spacing={Spacing.Md}
      >
        <Text variant={TextVariant.Lg} color={TextColor.Primary}>
          {title}
        </Text>
        <FormField
          label="Preset"
          control={
            <Select
              aria-label="Preset"
              exclusive
              onChange={handlePresetChange}
              options={PRESET_COLORMAP_OPTIONS}
              portal
              zIndex={ZIndex.AboveModal}
              value={selectedPreset ?? ""}
            />
          }
        />
        <div
          aria-label="Colormap preview"
          className={settingsStyles.colorPreviewLarge}
          style={{ background: colormapCssGradient({ list: normalizedStops }) }}
        />
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Input
            aria-label="Number of stops"
            error={numStops !== "" && !stopCountValid}
            max={MAX_POINT_CLOUD_COLORMAP_STOPS}
            min={MIN_POINT_CLOUD_COLORMAP_STOPS}
            onChange={(event) => setNumStops(event.target.value)}
            size={Size.Sm}
            type={InputType.Number}
            value={numStops}
          />
          <Button
            disabled={!stopCountValid}
            onClick={applyStopCount}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            Apply
          </Button>
        </Stack>
        <div className={settingsStyles.colorStopHeader}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Value
          </Text>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Color
          </Text>
          <span />
          <span />
        </div>
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          {stops.map((stop, index) => (
            <ColorStopRow
              index={index}
              key={stop.id}
              onColorChange={(color) => updateStop(index, { color })}
              onRemove={() => removeStop(index)}
              onValueChange={(value) => updateStop(index, { value })}
              removable={
                index !== 0 &&
                index !== stops.length - 1 &&
                stops.length > MIN_POINT_CLOUD_COLORMAP_STOPS
              }
              stop={stop}
            />
          ))}
        </Stack>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Button onClick={addStop} size={Size.Xs} variant={Variant.Secondary}>
            Add stop
          </Button>
          <Button onClick={save} size={Size.Xs}>
            Save
          </Button>
          <Button onClick={onClose} size={Size.Xs} variant={Variant.Secondary}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
}

function ColorStopRow({
  index,
  onColorChange,
  onRemove,
  onValueChange,
  removable,
  stop,
}: {
  readonly index: number;
  readonly onColorChange: (color: string) => void;
  readonly onRemove: () => void;
  readonly onValueChange: (value: number) => void;
  readonly removable: boolean;
  readonly stop: PointCloudColorStop;
}) {
  return (
    <div className={settingsStyles.colorStopRow}>
      <Input
        aria-label={`Color stop ${index + 1} value`}
        disabled={!removable}
        max={1}
        min={0}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0 && next <= 1) {
            onValueChange(next);
          }
        }}
        size={Size.Sm}
        step={0.01}
        type={InputType.Number}
        value={stop.value}
      />
      <Input
        aria-label={`Color stop ${index + 1} color`}
        onChange={(event) => onColorChange(event.target.value)}
        size={Size.Sm}
        value={stop.color}
      />
      <input
        aria-label={`Color stop ${index + 1} swatch`}
        className={settingsStyles.colorSwatchInput}
        onChange={(event) => onColorChange(event.target.value)}
        type="color"
        value={stop.color}
      />
      {removable ? (
        <Button onClick={onRemove} size={Size.Xs} variant={Variant.Secondary}>
          Remove
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function editableColorStops(
  stops: readonly PointCloudColorStop[],
): readonly EditablePointCloudColorStop[] {
  return stops.map(editableColorStop);
}

function editableColorStop(
  stop: PointCloudColorStop,
): EditablePointCloudColorStop {
  nextPointCloudColorStopId += 1;
  return {
    ...stop,
    id: `point-cloud-color-stop-${nextPointCloudColorStopId}`,
  };
}

function redistributeStops(
  stops: readonly PointCloudColorStop[],
  count: number,
): readonly PointCloudColorStop[] {
  const next: PointCloudColorStop[] = [];
  for (let index = 0; index < count; index++) {
    const value = index / (count - 1);
    const [lower, upper] = boundingStops(stops, value);
    const span = upper.value - lower.value;
    const factor = span > 0 ? (value - lower.value) / span : 0;
    next.push({
      color: interpolateHexColors(lower.color, upper.color, factor),
      value,
    });
  }
  return next;
}

function boundingStops(
  stops: readonly PointCloudColorStop[],
  value: number,
): readonly [PointCloudColorStop, PointCloudColorStop] {
  for (let index = 0; index < stops.length - 1; index++) {
    const lower = stops[index];
    const upper = stops[index + 1];
    if (lower.value <= value && upper.value >= value) {
      return [lower, upper];
    }
  }
  const last = stops[stops.length - 1];
  return [last, last];
}

function SettingsNullableNumberInput({
  label,
  onChange,
  tooltip,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: number | null) => void;
  readonly tooltip: string;
  readonly value: number | null;
}) {
  return (
    <FormField
      label={<SettingsLabel label={label} tooltip={tooltip} />}
      control={
        <Input
          aria-label={label}
          onChange={(event) => {
            if (event.target.value === "") {
              onChange(null);
              return;
            }
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(next);
            }
          }}
          placeholder="auto"
          size={Size.Sm}
          step="any"
          type={InputType.Number}
          value={value ?? ""}
        />
      }
    />
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

// Memoized: the host tile re-renders per playback tick, but this settings
// tree has no per-tick inputs — the tile stabilizes the grouped props so
// ticks skip reconciling it.
export default React.memo(Mcap3dTileSettings);
