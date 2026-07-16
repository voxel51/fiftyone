import {
  TileSettingsContent,
  useSetTileTitleHighlighted,
  useSetTileTitle,
  useTileDuplicator,
} from "@fiftyone/tiling";
import {
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Select,
  SelectAnchor,
  Text,
  TextColor,
  TextVariant,
  ZIndex,
} from "@voxel51/voodo";
import { useStore } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  CameraCalibrationVisualization,
  ImageVisualization,
} from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../visualization";
import { MCAP_SCENE_SOURCE_METADATA, MCAP_SOURCE_TYPE } from "../scene-sources";
import { findBestMatchingAnnotationTopics } from "../topic-matching";
import { ImagePanel } from "../../../visualization/panels/image";
import { imageTextureCacheKey } from "../../../visualization/panels/image-texture-cache";
import type { PanelNotice } from "../../../visualization/panels/panel-notices";
import { useImagePanZoom } from "../../../visualization/panels/use-image-pan-zoom";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/panels/gpu/gpu-point-cloud-projection-picker";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { usePublishMcapImageAspectRatio } from "./mcap-image-aspect-ratios";
import {
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  MCAP_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_MCAP_POINT_CLOUD_POINT_SIZE,
  useMcapImageProjection,
  useMcapPlaybackSettings,
} from "./mcap-modal-settings";
import {
  useMcapImageTileLabelTopics,
  useMcapImageTilePointCloudProjection,
} from "./mcap-panel-visibility";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import {
  chooseNextImageTopic,
  mcapImageTileBindingsAtom,
  useMcapHoveredFrustumImageTopic,
  useMcapImageTileHoverProps,
  usePublishMcapImageTileBinding,
} from "./mcap-tile-source-bindings";
import McapImageAnnotationOverlay from "./McapImageAnnotationOverlay";
import McapDepthHoverOverlay from "./McapDepthHoverOverlay";
import McapImageProjectionOverlay from "./McapImageProjectionOverlay";
import McapImageProjectionScene from "./McapImageProjectionScene";
import { useMcapHoverEcho } from "./mcap-hover-echo";
import McapSidebarGroup from "./McapSidebarGroup";
import { rankDefaultImageSources } from "./playback-layout";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import { McapSettingsLabel } from "./McapSettingsLabel";
import type { McapTileProps } from "./mcap-tile-types";
import {
  useMcapTopicContentFrame,
  useMcapTopicStream,
} from "./use-mcap-topic-stream";
import { useMcapVideoDecodeRunway } from "./use-mcap-video-decode-runways";
import { useMcapImageProjectionLayers } from "./use-mcap-image-projection-layers";
import {
  effectiveMcapCameraCalibration,
  resolveMcapCameraModel,
  type McapCameraModelResolution,
  type McapImageDisplayMode,
  type McapImageGeometryMode,
} from "./camera-geometry/mcap-camera-model";
import {
  mcapRectifiedImageDisplay,
  type McapRectifiedImageDisplay,
} from "./camera-geometry/mcap-image-rectification";

const IMAGE_FIT = "contain";
const EMPTY_PROJECTION_TOPICS: readonly string[] = [];
const AUTO_CALIBRATION_OPTION_ID = "__mcap_auto_calibration__";
const IMAGE_GEOMETRY_MODES: readonly McapImageGeometryMode[] = [
  "auto",
  "original",
  "rectified",
];
const IMAGE_GEOMETRY_LABELS: Record<McapImageGeometryMode, string> = {
  auto: "Auto (recommended)",
  original: "Original camera",
  rectified: "Rectified",
};
const IMAGE_DISPLAY_MODES: readonly McapImageDisplayMode[] = [
  "recorded",
  "rectified",
];
const IMAGE_DISPLAY_LABELS: Record<McapImageDisplayMode, string> = {
  recorded: "Recorded pixels",
  rectified: "Rectified view",
};
const CAMERA_CALIBRATION_HELP =
  "Calibration topic used for camera geometry. Auto uses a unique scene-inventory image-to-camera match and leaves ambiguous images unmatched; choosing a topic overrides that association for this image and its 3D frustum.";
const IMAGE_DISPLAY_HELP =
  "Pixels shown in this tile. Recorded pixels preserves the source image exactly. Rectified view remaps a supported original image into the calibration's rectified pixel space and moves annotations, projections, and picking with it.";
const RECORDED_IMAGE_GEOMETRY_HELP =
  "Coordinate system of the recorded image. Auto recognizes canonical image_raw and image_rect topic suffixes, accepts pixel-equivalent models, and withholds ambiguous overlays otherwise. Original camera applies K and lens distortion D. Rectified uses R and P without applying D.";
const POINT_CLOUD_PROJECTION_HELP =
  "Projects selected 3D point clouds into this camera image using its calibration and frame transforms. Choose which clouds to overlay and adjust their dot size. These settings affect only this image tile.";

const McapImageTile: React.FC<McapTileProps> = ({ initialSourceId }) => {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const projectionPickerRef =
    useRef<GpuPointCloudProjectionPickerHandle | null>(null);
  const sharedHover = useMcapHoverEcho();
  const images = useSceneSourcesByType(MCAP_SOURCE_TYPE.IMAGE);
  const annotationSources = useSceneSourcesByType(
    MCAP_SOURCE_TYPE.IMAGE_ANNOTATION,
  );
  const calibrationSources = useSceneSourcesByType(
    MCAP_SOURCE_TYPE.CAMERA_CALIBRATION,
  );
  const pointCloudSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const { fidelityMode } = useMcapPlaybackSettings();
  const setTileTitle = useSetTileTitle();
  const setTileTitleHighlighted = useSetTileTitleHighlighted();
  const hoveredFrustumImageTopic = useMcapHoveredFrustumImageTopic();
  const jotaiStore = useStore();
  // Open on the resolver-assigned source; tiles added by hand (split
  // buttons, add-tile menu) bind the default-preferred stream no sibling
  // tile is already showing — splitting repeatedly walks through cameras.
  // Read the bindings through the store, not useAtomValue: the default
  // matters only at bind time, and subscribing would re-render every
  // image tile whenever a sibling rebinds.
  const [topic, setTopic] = useState<string>(
    () =>
      initialSourceId ??
      chooseNextImageTopic(
        rankDefaultImageSources(images),
        jotaiStore.get(mcapImageTileBindingsAtom),
      ),
  );
  const { labelTopics: storedLabelTopics, setLabelTopics } =
    useMcapImageTileLabelTopics(topic);
  const { projection: cameraProjection, setProjection: setCameraProjection } =
    useMcapImageProjection(topic);
  const {
    projection: pointCloudProjection,
    setProjection: setPointCloudProjection,
  } = useMcapImageTilePointCloudProjection(topic);

  // This effect binds the pane to the best undisplayed image source once
  // sources resolve.
  useEffect(() => {
    if (topic && images.some((source) => source.id === topic)) return;

    const nextTopic = chooseNextImageTopic(
      rankDefaultImageSources(images),
      jotaiStore.get(mcapImageTileBindingsAtom),
    );
    if (nextTopic !== topic) setTopic(nextTopic);
  }, [images, jotaiStore, topic]);

  // Advertise this tile's stream so spawn points know what's on screen.
  usePublishMcapImageTileBinding(topic);
  // Hovering this tile lights up its camera frustum in the 3D scene.
  const hoverProps = useMcapImageTileHoverProps(topic);

  // This effect mirrors 3D camera hover into this image pane's title.
  useEffect(() => {
    const highlighted = Boolean(topic && hoveredFrustumImageTopic === topic);
    setTileTitleHighlighted(highlighted);
    return () => {
      if (highlighted) setTileTitleHighlighted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tile setter is stable
  }, [hoveredFrustumImageTopic, topic]);

  // How "Duplicate" clones this tile: same source, same title — unlike a
  // split, which spawns a fresh tile on the next undisplayed stream.
  useTileDuplicator(() => ({
    render: () => <McapImageTile initialSourceId={topic} />,
    title: images.find((s) => s.id === topic)?.label ?? "Image",
  }));

  // This effect syncs the tile title with the selected image source.
  useEffect(() => {
    const label = images.find((s) => s.id === topic)?.label;
    if (label) setTileTitle(label, { source: "auto" });
  }, [topic, images, setTileTitle]);

  // This effect resets image dimensions when the selected source changes.
  useEffect(() => {
    setImageDims(null);
  }, [topic]);

  // Keep the playback wrapper: `contentTimeNs` is the message identity the
  // shared image-texture cache key needs (bytes identity churns per batch).
  const playbackFrame = useMcapTopicContentFrame<ImageVisualization>(topic);
  const frame = playbackFrame?.frame ?? null;
  const decodeRunway = useMcapVideoDecodeRunway(topic, playbackFrame);
  const sourceKey = useMcapDataStream()?.sourceKey ?? "";
  // Shared texture key per (recording, topic, frame). The 3D tile's
  // frustum image planes form the same key, so both surfaces share one
  // decode and one GPU texture for the same camera frame.
  const textureKey =
    playbackFrame && sourceKey
      ? imageTextureCacheKey(sourceKey, topic, playbackFrame.contentTimeNs)
      : undefined;
  const annotationTopics = useMemo(
    () => annotationSources.map((s) => s.id),
    [annotationSources],
  );
  const labelSourceGroups = useMemo(() => {
    const matchingTopics = new Set(
      topic ? findBestMatchingAnnotationTopics(topic, annotationTopics) : [],
    );
    return {
      matching: annotationSources.filter((source) =>
        matchingTopics.has(source.id),
      ),
      remaining: annotationSources.filter(
        (source) => !matchingTopics.has(source.id),
      ),
    };
  }, [annotationSources, annotationTopics, topic]);
  const autoCalibrationTopic =
    images.find((source) => source.id === topic)?.metadata?.[
      MCAP_SCENE_SOURCE_METADATA.CALIBRATION_TOPIC
    ] ?? null;
  const explicitCalibrationTopic = cameraProjection.calibrationTopic;
  const explicitCalibrationAvailable =
    !explicitCalibrationTopic ||
    calibrationSources.some((source) => source.id === explicitCalibrationTopic);
  const calibrationTopic = explicitCalibrationTopic ?? autoCalibrationTopic;
  const calibration = useMcapTopicStream<CameraCalibrationVisualization>(
    calibrationTopic ?? "",
  );
  const effectiveCalibration = useMemo(
    () => (calibration ? effectiveMcapCameraCalibration(calibration) : null),
    [calibration],
  );
  const cameraModelResolution = useMemo(
    () =>
      calibration
        ? resolveMcapCameraModel({
            calibration,
            geometry: cameraProjection.geometry,
            imageTopic: topic,
          })
        : null,
    [calibration, cameraProjection.geometry, topic],
  );
  const rectifiedModelResolution = useMemo(
    () =>
      calibration
        ? resolveMcapCameraModel({
            calibration,
            geometry: "rectified",
            imageTopic: topic,
          })
        : null,
    [calibration, topic],
  );
  const sourceDimensionMismatch = Boolean(
    imageDims &&
    cameraModelResolution?.status === "ready" &&
    (imageDims.width !== cameraModelResolution.model.width ||
      imageDims.height !== cameraModelResolution.model.height),
  );
  const rectifiedDisplay = useMemo(() => {
    if (
      cameraProjection.display !== "rectified" ||
      sourceDimensionMismatch ||
      cameraModelResolution?.status !== "ready" ||
      cameraModelResolution.mode !== "original" ||
      rectifiedModelResolution?.status !== "ready"
    ) {
      return null;
    }
    return mcapRectifiedImageDisplay(
      cameraModelResolution.model,
      rectifiedModelResolution.model,
    );
  }, [
    cameraModelResolution,
    cameraProjection.display,
    rectifiedModelResolution,
    sourceDimensionMismatch,
  ]);
  const rectifiedViewActive = Boolean(
    cameraProjection.display === "rectified" &&
    !sourceDimensionMismatch &&
    cameraModelResolution?.status === "ready" &&
    (cameraModelResolution.mode === "rectified" || rectifiedDisplay),
  );
  const sourceCameraModel =
    cameraModelResolution?.status === "ready"
      ? cameraModelResolution.model
      : null;
  const displayCameraModel =
    rectifiedViewActive && rectifiedDisplay
      ? rectifiedDisplay.projectionModel
      : sourceCameraModel;
  // Calibration supplies authoritative dimensions before the first image
  // decodes, so annotation overlays and pan/zoom get the right aspect
  // immediately; the loaded image stays authoritative afterwards.
  const effectiveImageDims = useMemo(() => {
    if (rectifiedViewActive && displayCameraModel) {
      return {
        height: displayCameraModel.height,
        width: displayCameraModel.width,
      };
    }
    if (imageDims) {
      return imageDims;
    }
    if (effectiveCalibration) {
      return {
        height: effectiveCalibration.height,
        width: effectiveCalibration.width,
      };
    }
    return null;
  }, [
    displayCameraModel,
    effectiveCalibration,
    imageDims,
    rectifiedViewActive,
  ]);
  usePublishMcapImageAspectRatio(
    effectiveImageDims
      ? effectiveImageDims.width / effectiveImageDims.height
      : null,
  );
  const selectedLabelTopics = useMemo(() => {
    if (!topic) return [];
    const available = new Set(annotationTopics);
    return storedLabelTopics.filter((labelTopic) => available.has(labelTopic));
  }, [annotationTopics, storedLabelTopics, topic]);
  const activeTopics = useMemo(
    () => (topic ? [topic, ...selectedLabelTopics] : []),
    [selectedLabelTopics, topic],
  );
  const pointCloudTopics = useMemo(
    () => pointCloudSources.map((s) => s.id),
    [pointCloudSources],
  );
  const selectedProjectionTopics = useMemo(() => {
    if (!pointCloudProjection.enabled) return [];
    if (pointCloudProjection.topics === null) return pointCloudTopics;
    const available = new Set(pointCloudTopics);
    return pointCloudProjection.topics.filter((cloudTopic) =>
      available.has(cloudTopic),
    );
  }, [
    pointCloudProjection.enabled,
    pointCloudProjection.topics,
    pointCloudTopics,
  ]);
  const activeProjection =
    effectiveImageDims &&
    pointCloudProjection.enabled &&
    calibration &&
    calibration.coordinateFrameId &&
    displayCameraModel &&
    !sourceDimensionMismatch &&
    selectedProjectionTopics.length > 0
      ? {
          cameraFrameId: calibration.coordinateFrameId,
          cameraModel: displayCameraModel,
          imageDims: effectiveImageDims,
        }
      : null;
  const depthCameraFrameId =
    frame?.kind === VISUALIZATION_KIND.RAW_IMAGE
      ? (frame.coordinateFrameId ?? calibration?.coordinateFrameId)
      : undefined;
  const activeDepthHover =
    frame?.kind === VISUALIZATION_KIND.RAW_IMAGE &&
    frame.depth &&
    playbackFrame &&
    depthCameraFrameId &&
    sourceCameraModel &&
    displayCameraModel &&
    frame.width === sourceCameraModel.width &&
    frame.height === sourceCameraModel.height
      ? {
          cameraFrameId: depthCameraFrameId,
          contentTimeNs: playbackFrame.contentTimeNs,
          displayCameraModel,
          frame,
          sourceCameraModel,
        }
      : null;
  const projectionLayers = useMcapImageProjectionLayers(
    activeProjection ? selectedProjectionTopics : EMPTY_PROJECTION_TOPICS,
    activeProjection?.cameraFrameId,
  );
  const imagePanZoom = useImagePanZoom({
    fit: IMAGE_FIT,
    // The resting hand cursor would occlude the very dot a dwell hover
    // inspects; a crosshair pinpoints it. Dragging still shows "grabbing".
    idleCursor: activeProjection || activeDepthHover ? "crosshair" : undefined,
    imageSize: effectiveImageDims,
    resetKey: `${topic}\n${cameraProjection.display}\n${rectifiedViewActive}`,
  });
  const toggleLabelTopic = (labelTopic: string, checked: boolean) => {
    if (!topic) return;
    const next = new Set(selectedLabelTopics);
    if (checked) {
      next.add(labelTopic);
    } else {
      next.delete(labelTopic);
    }
    setLabelTopics(
      annotationTopics.filter((availableTopic) => next.has(availableTopic)),
    );
  };
  const toggleProjectionTopic = (cloudTopic: string, checked: boolean) => {
    const next = new Set(selectedProjectionTopics);
    if (checked) {
      next.add(cloudTopic);
    } else {
      next.delete(cloudTopic);
    }
    const topics = pointCloudTopics.filter((availableTopic) =>
      next.has(availableTopic),
    );
    setPointCloudProjection({ enabled: topics.length > 0, topics });
  };
  const canProjectPointClouds = pointCloudSources.length > 0;
  const canConfigureCameraGeometry =
    calibrationSources.length > 0 || canProjectPointClouds;
  const calibrationSelectionLabel = describeCalibrationSelection(
    cameraProjection.calibrationTopic,
    autoCalibrationTopic,
    calibrationSources,
  );
  const geometryStatus = describeCameraGeometry(cameraModelResolution);
  const rectifiedDisplayIssue = getRectifiedDisplayIssue({
    calibration,
    calibrationTopic,
    cameraModelResolution,
    display: cameraProjection.display,
    explicitCalibrationAvailable,
    imageDims,
    rectifiedDisplay,
    rectifiedModelResolution,
    sourceDimensionMismatch,
  });
  const projectionIssue = getProjectionIssue({
    calibration,
    calibrationTopic,
    cameraModelResolution,
    enabled:
      pointCloudProjection.enabled && selectedProjectionTopics.length > 0,
    explicitCalibrationAvailable,
    imageDims,
    sourceDimensionMismatch,
  });
  const visibleIssue = rectifiedDisplayIssue ?? projectionIssue;
  const geometryControlLabel = describeGeometryControl(
    cameraProjection.geometry,
    cameraModelResolution,
  );
  const imageNotices = useMemo<readonly PanelNotice[]>(
    () =>
      visibleIssue
        ? [
            {
              id: "mcap-image-projection",
              message: visibleIssue,
              severity: "warning",
            },
          ]
        : [],
    [visibleIssue],
  );
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

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <McapSidebarGroup title="Source">
            <Select
              anchor={SelectAnchor.BottomStart}
              aria-label="Source"
              exclusive
              onChange={(value) => {
                if (typeof value === "string") setTopic(value);
              }}
              options={imageSourceOptions}
              portal
              value={topic}
              zIndex={ZIndex.AboveModal}
            />
          </McapSidebarGroup>
          {canConfigureCameraGeometry ? (
            <McapSidebarGroup
              summary={`${IMAGE_DISPLAY_LABELS[cameraProjection.display]} · ${geometryControlLabel}`}
              title="Camera geometry"
            >
              <label className={settingsStyles.field}>
                <McapSettingsLabel
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
                      calibrationTopic:
                        value === AUTO_CALIBRATION_OPTION_ID ? null : value,
                    });
                  }}
                  options={calibrationSourceOptions}
                  portal
                  value={
                    cameraProjection.calibrationTopic ??
                    AUTO_CALIBRATION_OPTION_ID
                  }
                  zIndex={ZIndex.AboveModal}
                />
              </label>
              <label className={settingsStyles.field}>
                <McapSettingsLabel
                  label="Display"
                  tooltip={IMAGE_DISPLAY_HELP}
                />
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
                <McapSettingsLabel
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
                <span className={settingsStyles.metaText}>
                  {geometryStatus}
                </span>
              </label>
            </McapSidebarGroup>
          ) : null}
          {annotationSources.length > 0 ? (
            <McapSidebarGroup
              summary={`${selectedLabelTopics.length} of ${annotationSources.length} on`}
              title="Labels"
              toggle={{
                ariaLabel: "Toggle labels",
                checked: selectedLabelTopics.length > 0,
                onChange: (checked) => {
                  if (!topic) return;
                  setLabelTopics(checked ? [...annotationTopics] : []);
                },
              }}
            >
              <div className={settingsStyles.labelGroups}>
                <ImageLabelSourceGroup
                  sources={labelSourceGroups.matching}
                  selectedTopics={selectedLabelTopics}
                  title="Matching"
                  toggleTopic={toggleLabelTopic}
                />
                <ImageLabelSourceGroup
                  sources={labelSourceGroups.remaining}
                  selectedTopics={selectedLabelTopics}
                  title="Remaining"
                  toggleTopic={toggleLabelTopic}
                />
              </div>
            </McapSidebarGroup>
          ) : null}
          {canProjectPointClouds ? (
            <McapSidebarGroup
              summary={`${selectedProjectionTopics.length} of ${pointCloudSources.length} on`}
              title="Pointcloud projections"
              tooltip={POINT_CLOUD_PROJECTION_HELP}
              toggle={{
                ariaLabel: "Toggle pointcloud projections",
                checked: selectedProjectionTopics.length > 0,
                // Master toggle drives the children: on selects every
                // cloud, off unchecks them all.
                onChange: (checked) =>
                  setPointCloudProjection(
                    checked
                      ? { enabled: true, topics: null }
                      : { enabled: false, topics: [] },
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
                  max={MAX_MCAP_POINT_CLOUD_POINT_SIZE}
                  min={MIN_MCAP_POINT_CLOUD_POINT_SIZE}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) {
                      setPointCloudProjection({
                        pointSize: Math.min(
                          MAX_MCAP_POINT_CLOUD_POINT_SIZE,
                          Math.max(MIN_MCAP_POINT_CLOUD_POINT_SIZE, next),
                        ),
                      });
                    }
                  }}
                  step={MCAP_POINT_CLOUD_POINT_SIZE_STEP}
                  type="number"
                  value={pointCloudProjection.pointSize}
                />
              </label>
              <div className={settingsStyles.optionStack}>
                {pointCloudSources.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.label}
                    checked={selectedProjectionTopics.includes(s.id)}
                    onChange={(checked) => toggleProjectionTopic(s.id, checked)}
                    {...checkboxNoSpaceToggleProps}
                  />
                ))}
              </div>
            </McapSidebarGroup>
          ) : null}
        </div>
      </TileSettingsContent>
      {frame ? (
        <div
          className={styles.imageStack}
          {...hoverProps}
          onPointerCancel={imagePanZoom.onPointerCancel}
          onPointerDown={imagePanZoom.onPointerDown}
          onPointerMove={imagePanZoom.onPointerMove}
          onPointerUp={imagePanZoom.onPointerUp}
          ref={imagePanZoom.surfaceRef}
          style={imagePanZoom.surfaceStyle}
        >
          <ImagePanel
            canvasSurface="modal-image"
            decodeRunway={decodeRunway}
            frame={frame}
            className={styles.panel}
            fit={IMAGE_FIT}
            onImageLoaded={(width, height) =>
              setImageDims((prev) =>
                prev?.width === width && prev?.height === height
                  ? prev
                  : { width, height },
              )
            }
            onResetView={imagePanZoom.resetView}
            notices={imageNotices}
            sceneChildren={
              activeProjection ? (
                <McapImageProjectionScene
                  cameraModel={activeProjection.cameraModel}
                  fit={IMAGE_FIT}
                  imageHeight={activeProjection.imageDims.height}
                  imageWidth={activeProjection.imageDims.width}
                  hoveredPoint={sharedHover}
                  layers={projectionLayers}
                  pointSize={pointCloudProjection.pointSize}
                  ref={projectionPickerRef}
                  sourceKey={sourceKey || "mcap-session"}
                  viewTransform={imagePanZoom.viewTransform}
                />
              ) : undefined
            }
            textureMesh={
              rectifiedViewActive ? rectifiedDisplay?.textureMesh : null
            }
            textureKey={textureKey}
            viewTransform={imagePanZoom.viewTransform}
          />
          {activeDepthHover ? (
            <McapDepthHoverOverlay
              {...activeDepthHover}
              fit={IMAGE_FIT}
              imageTopic={topic}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {activeProjection ? (
            <McapImageProjectionOverlay
              cameraModel={activeProjection.cameraModel}
              fit={IMAGE_FIT}
              imageHeight={activeProjection.imageDims.height}
              imageWidth={activeProjection.imageDims.width}
              layers={projectionLayers}
              pickerRef={projectionPickerRef}
              pointSize={pointCloudProjection.pointSize}
              sourceKey={sourceKey || "mcap-session"}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {effectiveImageDims && selectedLabelTopics.length > 0 ? (
            <McapImageAnnotationOverlay
              fit={IMAGE_FIT}
              imageWidth={effectiveImageDims.width}
              imageHeight={effectiveImageDims.height}
              interpolate={fidelityMode === "smooth"}
              pixelTransform={
                rectifiedViewActive
                  ? rectifiedDisplay?.pixelTransform
                  : undefined
              }
              topics={selectedLabelTopics}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          <McapTileStatusBadge topics={activeTopics} />
        </div>
      ) : (
        <McapTileEmptyState topics={topic ? [topic] : []} />
      )}
    </>
  );
};

function ImageLabelSourceGroup({
  selectedTopics,
  sources,
  title,
  toggleTopic,
}: {
  readonly selectedTopics: readonly string[];
  readonly sources: readonly { readonly id: string; readonly label: string }[];
  readonly title: string;
  readonly toggleTopic: (topic: string, checked: boolean) => void;
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
            checked={selectedTopics.includes(source.id)}
            onChange={(checked) => toggleTopic(source.id, checked)}
            {...checkboxNoSpaceToggleProps}
          />
        ))}
      </div>
    </div>
  );
}

type ImageDimensions = { readonly height: number; readonly width: number };

function describeCalibrationSelection(
  explicitTopic: string | null,
  automaticTopic: string | null,
  sources: readonly { readonly id: string; readonly label: string }[],
): string {
  if (explicitTopic) {
    return sourceLabel(sources, explicitTopic);
  }
  return automaticTopic
    ? `Auto · ${sourceLabel(sources, automaticTopic)}`
    : "Auto · no match";
}

function sourceLabel(
  sources: readonly { readonly id: string; readonly label: string }[],
  topic: string,
): string {
  return sources.find((source) => source.id === topic)?.label ?? topic;
}

function describeCameraGeometry(
  resolution: McapCameraModelResolution | null,
): string {
  if (!resolution) {
    return "Waiting for camera calibration";
  }
  if (resolution.status === "ready") {
    const mode =
      resolution.mode === "original" ? "Original camera" : "Rectified";
    return `${mode} · ${resolution.model.kind}`;
  }
  if (resolution.suggestedMode) {
    return `${resolution.message}. Suggested: ${IMAGE_GEOMETRY_LABELS[resolution.suggestedMode]}`;
  }
  return resolution.message;
}

function describeGeometryControl(
  geometry: McapImageGeometryMode,
  resolution: McapCameraModelResolution | null,
): string {
  if (resolution?.status === "ready" && geometry === "auto") {
    const resolved = resolution.mode === "original" ? "Original" : "Rectified";
    return `Auto → ${resolved}`;
  }
  if (resolution?.status !== "ready" && resolution?.suggestedMode) {
    return "Choose geometry";
  }
  return IMAGE_GEOMETRY_LABELS[geometry];
}

function getRectifiedDisplayIssue({
  calibration,
  calibrationTopic,
  cameraModelResolution,
  display,
  explicitCalibrationAvailable,
  imageDims,
  rectifiedDisplay,
  rectifiedModelResolution,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationTopic: string | null;
  readonly cameraModelResolution: McapCameraModelResolution | null;
  readonly display: McapImageDisplayMode;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly rectifiedDisplay: McapRectifiedImageDisplay | null;
  readonly rectifiedModelResolution: McapCameraModelResolution | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (display !== "rectified") return null;
  if (!calibrationTopic) return "Rectified view needs a camera calibration";
  if (!explicitCalibrationAvailable) {
    return "The selected camera calibration is not available in this recording";
  }
  if (!calibration) return "Waiting for camera calibration";
  if (cameraModelResolution?.status !== "ready") {
    return (
      cameraModelResolution?.message ??
      "Choose the recorded image geometry before rectifying"
    );
  }
  if (sourceDimensionMismatch && imageDims) {
    const model = cameraModelResolution.model;
    return `Cannot rectify ${imageDims.width}×${imageDims.height} pixels with ${model.width}×${model.height} calibration`;
  }
  if (cameraModelResolution.mode === "rectified") return null;
  if (rectifiedModelResolution?.status !== "ready") {
    return "Rectified view requires a usable rectified projection matrix P";
  }
  return rectifiedDisplay ? null : "Unable to build a valid rectification map";
}

function getProjectionIssue({
  calibration,
  calibrationTopic,
  cameraModelResolution,
  enabled,
  explicitCalibrationAvailable,
  imageDims,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationTopic: string | null;
  readonly cameraModelResolution: McapCameraModelResolution | null;
  readonly enabled: boolean;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (!enabled) return null;
  if (!calibrationTopic) {
    return "Choose a camera calibration before projecting points";
  }
  if (!explicitCalibrationAvailable) {
    return "The selected camera calibration is not available in this recording";
  }
  if (!calibration) return "Waiting for camera calibration";
  if (cameraModelResolution?.status !== "ready") {
    return cameraModelResolution?.message ?? "Camera projection is unavailable";
  }
  if (!calibration.coordinateFrameId) {
    return "Camera calibration has no coordinate frame";
  }
  if (sourceDimensionMismatch && imageDims) {
    const model = cameraModelResolution.model;
    return `Image is ${imageDims.width}×${imageDims.height}, but calibration resolves to ${model.width}×${model.height}`;
  }
  return null;
}

export default McapImageTile;
