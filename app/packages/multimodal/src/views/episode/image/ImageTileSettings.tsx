import {
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Select,
  SelectAnchor,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ZIndex,
} from "@voxel51/voodo";
import React, { useMemo } from "react";

import type { SceneSource } from "../../../ir";
import {
  MAX_POINT_CLOUD_POINT_SIZE,
  MIN_POINT_CLOUD_POINT_SIZE,
  POINT_CLOUD_POINT_SIZE_STEP,
  type ImageProjectionSettings,
} from "../settings/modal/state";
import { settingsBooleanNoSpaceToggleProps } from "../settings/controls/settings-keyboard";
import { SettingsLabel } from "../settings/controls/SettingsLabel";
import SidebarGroup from "../settings/controls/SidebarGroup";
import type {
  ImageTile3dLabelProjection,
  ImageTilePointCloudProjection,
} from "../tiles/panel-visibility";
import settingsStyles from "../tiles/Tile.settings.module.css";
import type {
  ImageDisplayMode,
  ImageGeometryMode,
} from "../spatial/camera-geometry/camera-model";
import {
  IMAGE_DISPLAY_LABELS,
  IMAGE_GEOMETRY_LABELS,
} from "./image-camera-status";

const AUTO_CALIBRATION_OPTION_ID = "__episode_auto_calibration__";
const IMAGE_GEOMETRY_MODES: readonly ImageGeometryMode[] = [
  "auto",
  "original",
  "rectified",
];
const IMAGE_DISPLAY_MODES: readonly ImageDisplayMode[] = [
  "recorded",
  "rectified",
];
const CAMERA_CALIBRATION_HELP =
  "Calibration stream used for camera geometry. Auto uses a unique scene-inventory image-to-camera match and leaves ambiguous images unmatched; choosing a stream overrides that association for this image and its 3D frustum.";
const IMAGE_DISPLAY_HELP =
  "Pixels shown in this tile. Recorded pixels preserves the source image exactly. Rectified view remaps a supported original image into the calibration's rectified pixel space and moves annotations, projections, and picking with it.";
const RECORDED_IMAGE_GEOMETRY_HELP =
  "Coordinate system of the recorded image. Auto recognizes canonical image_raw and image_rect stream suffixes, accepts pixel-equivalent models, and withholds ambiguous overlays otherwise. Original camera applies K and lens distortion D. Rectified uses R and P without applying D.";
const POINT_CLOUD_PROJECTION_HELP =
  "Projects selected 3D point clouds into this camera image using its calibration and frame transforms. Choose which clouds to overlay and adjust their dot size. These settings affect only this image tile.";
const LABEL_3D_PROJECTION_HELP =
  "Projects selected 3D label topics into this camera image using its calibration and frame transforms. These settings affect only this image tile.";
const LABEL_3D_INTERPOLATION_HELP =
  "Interpolates compatible tracked 3D labels at each image's capture time. Recorded geometry is retained when stable matching is unsafe or the message gap is too large.";

interface ImageTileSettingsProps {
  readonly annotationSources: readonly SceneSource[];
  readonly annotationStreams: readonly string[];
  readonly calibrationSelectionLabel: string;
  readonly calibrationSources: readonly SceneSource[];
  readonly cameraProjection: ImageProjectionSettings;
  readonly canConfigureCameraGeometry: boolean;
  readonly geometryControlLabel: string;
  readonly geometryStatus: string;
  readonly images: readonly SceneSource[];
  readonly labelSourceGroups: {
    readonly matching: readonly SceneSource[];
    readonly remaining: readonly SceneSource[];
  };
  readonly label3dProjection: ImageTile3dLabelProjection;
  readonly pointCloudProjection: ImageTilePointCloudProjection;
  readonly pointCloudSources: readonly SceneSource[];
  readonly sceneAnnotationSources: readonly SceneSource[];
  readonly selectedLabelStreams: readonly string[];
  readonly selectedProjectionStreams: readonly string[];
  readonly selectedSceneAnnotationStreams: readonly string[];
  readonly setCameraProjection: (
    settings: Partial<ImageProjectionSettings>,
  ) => void;
  readonly setLabel3dProjection: (
    settings: Partial<ImageTile3dLabelProjection>,
  ) => void;
  readonly setLabelStreams: (streams: readonly string[]) => void;
  readonly setPointCloudProjection: (
    settings: Partial<ImageTilePointCloudProjection>,
  ) => void;
  readonly setStream: (stream: string) => void;
  readonly stream: string;
  readonly toggleLabelStream: (stream: string, checked: boolean) => void;
  readonly toggleProjectionStream: (stream: string, checked: boolean) => void;
  readonly toggleSceneAnnotationStream: (
    stream: string,
    checked: boolean,
  ) => void;
}

/** Sidebar controls for one image tile; rendering stays in ImageTile. */
const ImageTileSettings: React.FC<ImageTileSettingsProps> = ({
  annotationSources,
  annotationStreams,
  calibrationSelectionLabel,
  calibrationSources,
  cameraProjection,
  canConfigureCameraGeometry,
  geometryControlLabel,
  geometryStatus,
  images,
  labelSourceGroups,
  label3dProjection,
  pointCloudProjection,
  pointCloudSources,
  sceneAnnotationSources,
  selectedLabelStreams,
  selectedProjectionStreams,
  selectedSceneAnnotationStreams,
  setCameraProjection,
  setLabel3dProjection,
  setLabelStreams,
  setPointCloudProjection,
  setStream,
  stream,
  toggleLabelStream,
  toggleProjectionStream,
  toggleSceneAnnotationStream,
}) => {
  const imageSourceOptions = useMemo(
    () =>
      images.map((source) => ({
        data: { label: source.label },
        id: source.id,
      })),
    [images],
  );
  const calibrationSourceOptions = useMemo(
    () => [
      {
        data: { label: calibrationSelectionLabel },
        id: AUTO_CALIBRATION_OPTION_ID,
      },
      ...calibrationSources.map((source) => ({
        data: { label: source.label },
        id: source.id,
      })),
    ],
    [calibrationSelectionLabel, calibrationSources],
  );
  const matchingLabelStreams = useMemo(
    () => labelSourceGroups.matching.map((source) => source.id),
    [labelSourceGroups.matching],
  );
  const hasEnabledMatchingLabels = useMemo(() => {
    const selected = new Set(selectedLabelStreams);
    return matchingLabelStreams.some((labelStream) =>
      selected.has(labelStream),
    );
  }, [matchingLabelStreams, selectedLabelStreams]);
  const canProject3dLabels = sceneAnnotationSources.length > 0;
  const canProjectPointClouds = pointCloudSources.length > 0;

  return (
    <div className={settingsStyles.root}>
      <SidebarGroup title="Source">
        <Select
          anchor={SelectAnchor.BottomStart}
          aria-label="Source"
          exclusive
          onChange={(value) => {
            if (typeof value === "string") setStream(value);
          }}
          options={imageSourceOptions}
          portal
          value={stream}
          zIndex={ZIndex.AboveModal}
        />
      </SidebarGroup>
      {canConfigureCameraGeometry ? (
        <SidebarGroup
          summary={`${IMAGE_DISPLAY_LABELS[cameraProjection.display]} · ${geometryControlLabel}`}
          title="Camera geometry"
        >
          <label className={settingsStyles.field}>
            <SettingsLabel
              label="Calibration"
              tooltip={CAMERA_CALIBRATION_HELP}
            />
            <Select
              anchor={SelectAnchor.BottomStart}
              aria-label="Calibration"
              exclusive
              onChange={(value) => {
                if (typeof value !== "string") return;
                setCameraProjection({
                  calibrationStream:
                    value === AUTO_CALIBRATION_OPTION_ID ? null : value,
                });
              }}
              options={calibrationSourceOptions}
              portal
              value={
                cameraProjection.calibrationStream ?? AUTO_CALIBRATION_OPTION_ID
              }
              zIndex={ZIndex.AboveModal}
            />
          </label>
          <label className={settingsStyles.field}>
            <SettingsLabel label="Display" tooltip={IMAGE_DISPLAY_HELP} />
            <Dropdown
              anchor={DropdownAnchor.BottomStart}
              trigger={
                <DropdownTrigger>
                  {IMAGE_DISPLAY_LABELS[cameraProjection.display]}
                </DropdownTrigger>
              }
            >
              {IMAGE_DISPLAY_MODES.map((mode) => (
                <MenuTextItem
                  key={mode}
                  onClick={() => setCameraProjection({ display: mode })}
                >
                  {IMAGE_DISPLAY_LABELS[mode]}
                </MenuTextItem>
              ))}
            </Dropdown>
          </label>
          <label className={settingsStyles.field}>
            <SettingsLabel
              label="Recorded image geometry"
              tooltip={RECORDED_IMAGE_GEOMETRY_HELP}
            />
            <Dropdown
              anchor={DropdownAnchor.BottomStart}
              trigger={
                <DropdownTrigger>
                  {IMAGE_GEOMETRY_LABELS[cameraProjection.geometry]}
                </DropdownTrigger>
              }
            >
              {IMAGE_GEOMETRY_MODES.map((mode) => (
                <MenuTextItem
                  key={mode}
                  onClick={() => setCameraProjection({ geometry: mode })}
                >
                  {IMAGE_GEOMETRY_LABELS[mode]}
                </MenuTextItem>
              ))}
            </Dropdown>
            <span className={settingsStyles.metaText}>{geometryStatus}</span>
          </label>
        </SidebarGroup>
      ) : null}
      {annotationSources.length > 0 ? (
        <SidebarGroup
          summary={`${selectedLabelStreams.length} of ${annotationSources.length} on`}
          title="Labels"
          toggle={{
            ariaLabel: "Toggle matching labels",
            checked: hasEnabledMatchingLabels,
            onChange: (checked) => {
              if (!stream) return;
              const next = new Set(selectedLabelStreams);
              for (const labelStream of matchingLabelStreams) {
                if (checked) next.add(labelStream);
                else next.delete(labelStream);
              }
              setLabelStreams(
                annotationStreams.filter((labelStream) =>
                  next.has(labelStream),
                ),
              );
            },
          }}
        >
          <div className={settingsStyles.labelGroups}>
            <ImageLabelSourceGroup
              sources={labelSourceGroups.matching}
              selectedStreams={selectedLabelStreams}
              title="Matching"
              toggleStream={toggleLabelStream}
            />
            <ImageLabelSourceGroup
              sources={labelSourceGroups.remaining}
              selectedStreams={selectedLabelStreams}
              title="Remaining"
              toggleStream={toggleLabelStream}
            />
          </div>
        </SidebarGroup>
      ) : null}
      {canProject3dLabels || canProjectPointClouds ? (
        <SidebarGroup title="3D Projection">
          <div className={settingsStyles.projectionGroups}>
            {canProject3dLabels ? (
              <SidebarGroup
                summary={`${selectedSceneAnnotationStreams.length} of ${sceneAnnotationSources.length} on`}
                title="3D Labels"
                tooltip={LABEL_3D_PROJECTION_HELP}
                toggle={{
                  ariaLabel: "Toggle 3D label projections",
                  checked:
                    label3dProjection.enabled &&
                    selectedSceneAnnotationStreams.length > 0,
                  onChange: (checked) =>
                    setLabel3dProjection(
                      checked
                        ? { enabled: true, streams: null }
                        : { enabled: false, streams: [] },
                    ),
                }}
              >
                <div className={settingsStyles.sectionHeader}>
                  <SettingsLabel
                    label="Interpolate projections"
                    tooltip={LABEL_3D_INTERPOLATION_HELP}
                  />
                  <Toggle
                    aria-label="Interpolate projections"
                    checked={label3dProjection.interpolate}
                    onChange={(interpolate) =>
                      setLabel3dProjection({ interpolate })
                    }
                    size={Size.Sm}
                    {...settingsBooleanNoSpaceToggleProps}
                  />
                </div>
                <div className={settingsStyles.optionStack}>
                  {sceneAnnotationSources.map((source) => (
                    <Checkbox
                      key={source.id}
                      label={source.label}
                      checked={selectedSceneAnnotationStreams.includes(
                        source.id,
                      )}
                      onChange={(checked) =>
                        toggleSceneAnnotationStream(source.id, checked)
                      }
                      {...settingsBooleanNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </SidebarGroup>
            ) : null}
            {canProjectPointClouds ? (
              <SidebarGroup
                summary={`${selectedProjectionStreams.length} of ${pointCloudSources.length} on`}
                title="Pointclouds"
                tooltip={POINT_CLOUD_PROJECTION_HELP}
                toggle={{
                  ariaLabel: "Toggle pointcloud projections",
                  checked: selectedProjectionStreams.length > 0,
                  onChange: (checked) =>
                    setPointCloudProjection(
                      checked
                        ? { enabled: true, streams: null }
                        : { enabled: false, streams: [] },
                    ),
                }}
              >
                <label className={settingsStyles.field}>
                  <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                    Point size
                  </Text>
                  <input
                    aria-label="Point size"
                    className={settingsStyles.select}
                    max={MAX_POINT_CLOUD_POINT_SIZE}
                    min={MIN_POINT_CLOUD_POINT_SIZE}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) {
                        setPointCloudProjection({
                          pointSize: clampImageProjectionPointSize(next),
                        });
                      }
                    }}
                    step={POINT_CLOUD_POINT_SIZE_STEP}
                    type="number"
                    value={pointCloudProjection.pointSize}
                  />
                </label>
                <div className={settingsStyles.optionStack}>
                  {pointCloudSources.map((source) => (
                    <Checkbox
                      key={source.id}
                      label={source.label}
                      checked={selectedProjectionStreams.includes(source.id)}
                      onChange={(checked) =>
                        toggleProjectionStream(source.id, checked)
                      }
                      {...settingsBooleanNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </SidebarGroup>
            ) : null}
          </div>
        </SidebarGroup>
      ) : null}
    </div>
  );
};

function clampImageProjectionPointSize(value: number): number {
  return Math.min(
    MAX_POINT_CLOUD_POINT_SIZE,
    Math.max(MIN_POINT_CLOUD_POINT_SIZE, value),
  );
}

function ImageLabelSourceGroup({
  selectedStreams,
  sources,
  title,
  toggleStream,
}: {
  readonly selectedStreams: readonly string[];
  readonly sources: readonly { readonly id: string; readonly label: string }[];
  readonly title: string;
  readonly toggleStream: (stream: string, checked: boolean) => void;
}) {
  if (sources.length === 0) return null;

  return (
    <div className={settingsStyles.field}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {title}
      </Text>
      <div className={settingsStyles.optionStack}>
        {sources.map((source) => (
          <Checkbox
            key={source.id}
            label={source.label}
            checked={selectedStreams.includes(source.id)}
            onChange={(checked) => toggleStream(source.id, checked)}
            {...settingsBooleanNoSpaceToggleProps}
          />
        ))}
      </div>
    </div>
  );
}

export default ImageTileSettings;
