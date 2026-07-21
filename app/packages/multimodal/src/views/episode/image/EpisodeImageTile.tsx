import {
  useSetTileTitleHighlighted,
  useSetTileTitle,
  useTileDuplicator,
  useTileId,
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublishAnnotationStreams } from "../../../extensions/timeline";
import type {
  CameraCalibrationVisualization,
  ImageVisualization,
} from "../../../decoders";
import { SCENE_SOURCE_METADATA, SCENE_SOURCE_TYPE } from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../visualization";
import { findBestMatchingAnnotationStreams } from "../../../stream-matching";
import { ImagePanel } from "../../../visualization/image/ImagePanel";
import { imageTextureCacheKey } from "../../../visualization/image/image-texture-cache";
import type { PanelNotice } from "../../../visualization/shared/panel-notices";
import { useImagePanZoom } from "../../../visualization/image/use-image-pan-zoom";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/webgpu/gpu-point-cloud-projection-picker";
import { useEpisodeDataStream } from "../playback/episode-data-stream-context";
import { usePublishEpisodeImageAspectRatio } from "./episode-image-aspect-ratios";
import {
  MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
  EPISODE_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_EPISODE_POINT_CLOUD_POINT_SIZE,
  useEpisodeImageProjection,
  useEpisodePlaybackSettings,
} from "../settings/episode-modal-settings";
import {
  useEpisodeImageTileLabelStreams,
  useEpisodeImageTilePointCloudProjection,
} from "../tiles/episode-panel-visibility";
import { checkboxNoSpaceToggleProps } from "../settings/episode-settings-keyboard";
import {
  chooseNextImageStream,
  episodeImageTileBindingsAtom,
  useEpisodeHoveredFrustumImageStream,
  useEpisodeImageTileHoverProps,
  usePublishEpisodeImageTileBinding,
} from "../tiles/episode-tile-source-bindings";
import EpisodeImageAnnotationOverlay from "./EpisodeImageAnnotationOverlay";
import EpisodeDepthHoverOverlay from "./EpisodeDepthHoverOverlay";
import EpisodeImageProjectionOverlay from "./EpisodeImageProjectionOverlay";
import EpisodeImageProjectionScene from "./EpisodeImageProjectionScene";
import { useEpisodeHoverEcho } from "./episode-hover-echo";
import { useRegisterEpisodeTileSettings } from "../tiles/episode-tile-settings-context";
import EpisodeSidebarGroup from "../settings/EpisodeSidebarGroup";
import { rankDefaultImageSources } from "../layout/playback-layout";
import settingsStyles from "../tiles/EpisodeTile.settings.module.css";
import styles from "../tiles/EpisodeTile.module.css";
import {
  EpisodeTileEmptyState,
  EpisodeTileStatusBadge,
} from "../tiles/EpisodeTileStreamState";
import { EpisodeSettingsLabel } from "../settings/EpisodeSettingsLabel";
import type { EpisodeTileProps } from "../tiles/episode-tile-types";
import {
  useEpisodeStreamContentFrame,
  useEpisodeStreamValue,
} from "../playback/use-episode-stream-values";
import { useEpisodeVideoDecodeRunway } from "./use-episode-video-decode-runways";
import { useEpisodeImageProjectionLayers } from "./use-episode-image-projection-layers";
import {
  effectiveEpisodeCameraCalibration,
  resolveEpisodeCameraModel,
  type EpisodeCameraModelResolution,
  type EpisodeImageDisplayMode,
  type EpisodeImageGeometryMode,
} from "./camera-geometry/episode-camera-model";
import {
  episodeRectifiedImageDisplay,
  type EpisodeRectifiedImageDisplay,
} from "./camera-geometry/episode-image-rectification";

const IMAGE_FIT = "contain";
const EMPTY_PROJECTION_STREAMS: readonly string[] = [];
const AUTO_CALIBRATION_OPTION_ID = "__episode_auto_calibration__";
const IMAGE_GEOMETRY_MODES: readonly EpisodeImageGeometryMode[] = [
  "auto",
  "original",
  "rectified",
];
const IMAGE_GEOMETRY_LABELS: Record<EpisodeImageGeometryMode, string> = {
  auto: "Auto (recommended)",
  original: "Original camera",
  rectified: "Rectified",
};
const IMAGE_DISPLAY_MODES: readonly EpisodeImageDisplayMode[] = [
  "recorded",
  "rectified",
];
const IMAGE_DISPLAY_LABELS: Record<EpisodeImageDisplayMode, string> = {
  recorded: "Recorded pixels",
  rectified: "Rectified view",
};
const CAMERA_CALIBRATION_HELP =
  "Calibration stream used for camera geometry. Auto uses a unique scene-inventory image-to-camera match and leaves ambiguous images unmatched; choosing a stream overrides that association for this image and its 3D frustum.";
const IMAGE_DISPLAY_HELP =
  "Pixels shown in this tile. Recorded pixels preserves the source image exactly. Rectified view remaps a supported original image into the calibration's rectified pixel space and moves annotations, projections, and picking with it.";
const RECORDED_IMAGE_GEOMETRY_HELP =
  "Coordinate system of the recorded image. Auto recognizes canonical image_raw and image_rect stream suffixes, accepts pixel-equivalent models, and withholds ambiguous overlays otherwise. Original camera applies K and lens distortion D. Rectified uses R and P without applying D.";
const POINT_CLOUD_PROJECTION_HELP =
  "Projects selected 3D point clouds into this camera image using its calibration and frame transforms. Choose which clouds to overlay and adjust their dot size. These settings affect only this image tile.";

const EpisodeImageTile: React.FC<EpisodeTileProps> = ({ initialSourceId }) => {
  const tileId = useTileId();
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const projectionPickerRef =
    useRef<GpuPointCloudProjectionPickerHandle | null>(null);
  const sharedHover = useEpisodeHoverEcho();
  const images = useSceneSourcesByType(SCENE_SOURCE_TYPE.IMAGE);
  const annotationSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
  );
  const calibrationSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
  );
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const { fidelityMode } = useEpisodePlaybackSettings();
  const setTileTitle = useSetTileTitle();
  const setTileTitleHighlighted = useSetTileTitleHighlighted();
  const hoveredFrustumImageStream = useEpisodeHoveredFrustumImageStream();
  const jotaiStore = useStore();
  // Open on the resolver-assigned source; tiles added by hand (split
  // buttons, add-tile menu) bind the default-preferred stream no sibling
  // tile is already showing — splitting repeatedly walks through cameras.
  // Read the bindings through the store, not useAtomValue: the default
  // matters only at bind time, and subscribing would re-render every
  // image tile whenever a sibling rebinds.
  const [stream, setStream] = useState<string>(
    () =>
      initialSourceId ??
      chooseNextImageStream(
        rankDefaultImageSources(images),
        jotaiStore.get(episodeImageTileBindingsAtom),
      ),
  );
  const { labelStreams: storedLabelStreams, setLabelStreams } =
    useEpisodeImageTileLabelStreams(stream);
  const { projection: cameraProjection, setProjection: setCameraProjection } =
    useEpisodeImageProjection(stream);
  const {
    projection: pointCloudProjection,
    setProjection: setPointCloudProjection,
  } = useEpisodeImageTilePointCloudProjection(stream);

  // This effect binds the pane to the best undisplayed image source once
  // sources resolve.
  useEffect(() => {
    if (stream && images.some((source) => source.id === stream)) return;

    const nextStream = chooseNextImageStream(
      rankDefaultImageSources(images),
      jotaiStore.get(episodeImageTileBindingsAtom),
    );
    if (nextStream !== stream) setStream(nextStream);
  }, [images, jotaiStore, stream]);

  // Advertise this tile's stream so spawn points know what's on screen.
  usePublishEpisodeImageTileBinding(stream);
  // Hovering this tile lights up its camera frustum in the 3D scene.
  const hoverProps = useEpisodeImageTileHoverProps(stream);

  // This effect mirrors 3D camera hover into this image pane's title.
  useEffect(() => {
    const highlighted = Boolean(stream && hoveredFrustumImageStream === stream);
    setTileTitleHighlighted(highlighted);
    return () => {
      if (highlighted) setTileTitleHighlighted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tile setter is stable
  }, [hoveredFrustumImageStream, stream]);

  // How "Duplicate" clones this tile: same source, same title — unlike a
  // split, which spawns a fresh tile on the next undisplayed stream.
  useTileDuplicator(() => ({
    render: () => <EpisodeImageTile initialSourceId={stream} />,
    title: images.find((s) => s.id === stream)?.label ?? "Image",
  }));

  // This effect syncs the tile title with the selected image source.
  useEffect(() => {
    const label = images.find((s) => s.id === stream)?.label;
    if (label) setTileTitle(label, { source: "auto" });
  }, [stream, images, setTileTitle]);

  // This effect resets image dimensions when the selected source changes.
  useEffect(() => {
    setImageDims(null);
  }, [stream]);

  // Keep the playback wrapper: `contentTimeNs` is the message identity the
  // shared image-texture cache key needs (bytes identity churns per batch).
  const playbackFrame =
    useEpisodeStreamContentFrame<ImageVisualization>(stream);
  const frame = playbackFrame?.frame ?? null;
  const decodeRunway = useEpisodeVideoDecodeRunway(stream, playbackFrame);
  const sourceKey = useEpisodeDataStream()?.sourceKey ?? "";
  // Shared texture key per (recording, stream, frame). The 3D tile's
  // frustum image planes form the same key, so both surfaces share one
  // decode and one GPU texture for the same camera frame.
  const textureKey =
    playbackFrame && sourceKey
      ? imageTextureCacheKey(sourceKey, stream, playbackFrame.contentTimeNs)
      : undefined;
  const annotationStreams = useMemo(
    () => annotationSources.map((s) => s.id),
    [annotationSources],
  );
  const labelSourceGroups = useMemo(() => {
    const matchingStreams = new Set(
      stream
        ? findBestMatchingAnnotationStreams(stream, annotationStreams)
        : [],
    );
    return {
      matching: annotationSources.filter((source) =>
        matchingStreams.has(source.id),
      ),
      remaining: annotationSources.filter(
        (source) => !matchingStreams.has(source.id),
      ),
    };
  }, [annotationSources, annotationStreams, stream]);
  const autoCalibrationStream =
    images.find((source) => source.id === stream)?.metadata?.[
      SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID
    ] ?? null;
  const explicitCalibrationStream = cameraProjection.calibrationStream;
  const explicitCalibrationAvailable =
    !explicitCalibrationStream ||
    calibrationSources.some(
      (source) => source.id === explicitCalibrationStream,
    );
  const calibrationStream = explicitCalibrationStream ?? autoCalibrationStream;
  const calibration = useEpisodeStreamValue<CameraCalibrationVisualization>(
    calibrationStream ?? "",
  );
  const effectiveCalibration = useMemo(
    () => (calibration ? effectiveEpisodeCameraCalibration(calibration) : null),
    [calibration],
  );
  const cameraModelResolution = useMemo(
    () =>
      calibration
        ? resolveEpisodeCameraModel({
            calibration,
            geometry: cameraProjection.geometry,
            imageStream: stream,
          })
        : null,
    [calibration, cameraProjection.geometry, stream],
  );
  const rectifiedModelResolution = useMemo(
    () =>
      calibration
        ? resolveEpisodeCameraModel({
            calibration,
            geometry: "rectified",
            imageStream: stream,
          })
        : null,
    [calibration, stream],
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
    return episodeRectifiedImageDisplay(
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
  usePublishEpisodeImageAspectRatio(
    effectiveImageDims
      ? effectiveImageDims.width / effectiveImageDims.height
      : null,
  );
  const selectedLabelStreams = useMemo(() => {
    if (!stream) return [];
    const available = new Set(annotationStreams);
    return storedLabelStreams.filter((labelStream) =>
      available.has(labelStream),
    );
  }, [annotationStreams, storedLabelStreams, stream]);
  usePublishAnnotationStreams(selectedLabelStreams);
  const activeStreams = useMemo(
    () => (stream ? [stream, ...selectedLabelStreams] : []),
    [selectedLabelStreams, stream],
  );
  const pointCloudStreams = useMemo(
    () => pointCloudSources.map((s) => s.id),
    [pointCloudSources],
  );
  const selectedProjectionStreams = useMemo(() => {
    if (!pointCloudProjection.enabled) return [];
    if (pointCloudProjection.streams === null) return pointCloudStreams;
    const available = new Set(pointCloudStreams);
    return pointCloudProjection.streams.filter((cloudStream) =>
      available.has(cloudStream),
    );
  }, [
    pointCloudProjection.enabled,
    pointCloudProjection.streams,
    pointCloudStreams,
  ]);
  const activeProjection =
    effectiveImageDims &&
    pointCloudProjection.enabled &&
    calibration &&
    calibration.coordinateFrameId &&
    displayCameraModel &&
    !sourceDimensionMismatch &&
    selectedProjectionStreams.length > 0
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
  const projectionLayers = useEpisodeImageProjectionLayers(
    activeProjection ? selectedProjectionStreams : EMPTY_PROJECTION_STREAMS,
    activeProjection?.cameraFrameId,
  );
  const imagePanZoom = useImagePanZoom({
    fit: IMAGE_FIT,
    // The resting hand cursor would occlude the very dot a dwell hover
    // inspects; a crosshair pinpoints it. Dragging still shows "grabbing".
    idleCursor: activeProjection || activeDepthHover ? "crosshair" : undefined,
    imageSize: effectiveImageDims,
    resetKey: `${stream}\n${cameraProjection.display}\n${rectifiedViewActive}`,
  });
  const toggleLabelStream = useCallback(
    (labelStream: string, checked: boolean) => {
      if (!stream) return;
      const next = new Set(selectedLabelStreams);
      if (checked) {
        next.add(labelStream);
      } else {
        next.delete(labelStream);
      }
      setLabelStreams(
        annotationStreams.filter((availableStream) =>
          next.has(availableStream),
        ),
      );
    },
    [annotationStreams, selectedLabelStreams, setLabelStreams, stream],
  );
  const toggleProjectionStream = useCallback(
    (cloudStream: string, checked: boolean) => {
      const next = new Set(selectedProjectionStreams);
      if (checked) {
        next.add(cloudStream);
      } else {
        next.delete(cloudStream);
      }
      const streams = pointCloudStreams.filter((availableStream) =>
        next.has(availableStream),
      );
      setPointCloudProjection({ enabled: streams.length > 0, streams });
    },
    [pointCloudStreams, selectedProjectionStreams, setPointCloudProjection],
  );
  const canProjectPointClouds = pointCloudSources.length > 0;
  const canConfigureCameraGeometry =
    calibrationSources.length > 0 || canProjectPointClouds;
  const calibrationSelectionLabel = describeCalibrationSelection(
    cameraProjection.calibrationStream,
    autoCalibrationStream,
    calibrationSources,
  );
  const geometryStatus = describeCameraGeometry(cameraModelResolution);
  const rectifiedDisplayIssue = getRectifiedDisplayIssue({
    calibration,
    calibrationStream,
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
    calibrationStream,
    cameraModelResolution,
    enabled:
      pointCloudProjection.enabled && selectedProjectionStreams.length > 0,
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
              id: "episode-image-projection",
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

  const settingsRegistration = useMemo(
    () => ({
      content: (
        <div className={settingsStyles.root}>
          <EpisodeSidebarGroup title="Source">
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
          </EpisodeSidebarGroup>
          {canConfigureCameraGeometry ? (
            <EpisodeSidebarGroup
              summary={`${IMAGE_DISPLAY_LABELS[cameraProjection.display]} · ${geometryControlLabel}`}
              title="Camera geometry"
            >
              <label className={settingsStyles.field}>
                <EpisodeSettingsLabel
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
                    cameraProjection.calibrationStream ??
                    AUTO_CALIBRATION_OPTION_ID
                  }
                  zIndex={ZIndex.AboveModal}
                />
              </label>
              <label className={settingsStyles.field}>
                <EpisodeSettingsLabel
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
                <EpisodeSettingsLabel
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
            </EpisodeSidebarGroup>
          ) : null}
          {annotationSources.length > 0 ? (
            <EpisodeSidebarGroup
              summary={`${selectedLabelStreams.length} of ${annotationSources.length} on`}
              title="Labels"
              toggle={{
                ariaLabel: "Toggle labels",
                checked: selectedLabelStreams.length > 0,
                onChange: (checked) => {
                  if (!stream) return;
                  setLabelStreams(checked ? [...annotationStreams] : []);
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
            </EpisodeSidebarGroup>
          ) : null}
          {canProjectPointClouds ? (
            <EpisodeSidebarGroup
              summary={`${selectedProjectionStreams.length} of ${pointCloudSources.length} on`}
              title="Pointcloud projections"
              tooltip={POINT_CLOUD_PROJECTION_HELP}
              toggle={{
                ariaLabel: "Toggle pointcloud projections",
                checked: selectedProjectionStreams.length > 0,
                // Master toggle drives the children: on selects every
                // cloud, off unchecks them all.
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
                  max={MAX_EPISODE_POINT_CLOUD_POINT_SIZE}
                  min={MIN_EPISODE_POINT_CLOUD_POINT_SIZE}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) {
                      setPointCloudProjection({
                        pointSize: Math.min(
                          MAX_EPISODE_POINT_CLOUD_POINT_SIZE,
                          Math.max(MIN_EPISODE_POINT_CLOUD_POINT_SIZE, next),
                        ),
                      });
                    }
                  }}
                  step={EPISODE_POINT_CLOUD_POINT_SIZE_STEP}
                  type="number"
                  value={pointCloudProjection.pointSize}
                />
              </label>
              <div className={settingsStyles.optionStack}>
                {pointCloudSources.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.label}
                    checked={selectedProjectionStreams.includes(s.id)}
                    onChange={(checked) =>
                      toggleProjectionStream(s.id, checked)
                    }
                    {...checkboxNoSpaceToggleProps}
                  />
                ))}
              </div>
            </EpisodeSidebarGroup>
          ) : null}
        </div>
      ),
      streamStreams: activeStreams,
    }),
    [
      activeStreams,
      annotationSources.length,
      annotationStreams,
      calibrationSourceOptions,
      cameraProjection,
      canConfigureCameraGeometry,
      canProjectPointClouds,
      geometryControlLabel,
      geometryStatus,
      imageSourceOptions,
      labelSourceGroups,
      pointCloudProjection,
      pointCloudSources,
      selectedLabelStreams,
      selectedProjectionStreams,
      setCameraProjection,
      setLabelStreams,
      setPointCloudProjection,
      stream,
      toggleLabelStream,
      toggleProjectionStream,
    ],
  );
  useRegisterEpisodeTileSettings(tileId, settingsRegistration);

  return (
    <>
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
                <EpisodeImageProjectionScene
                  cameraModel={activeProjection.cameraModel}
                  fit={IMAGE_FIT}
                  imageHeight={activeProjection.imageDims.height}
                  imageWidth={activeProjection.imageDims.width}
                  hoveredPoint={sharedHover}
                  layers={projectionLayers}
                  pointSize={pointCloudProjection.pointSize}
                  ref={projectionPickerRef}
                  sourceKey={sourceKey || "episode-session"}
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
            <EpisodeDepthHoverOverlay
              {...activeDepthHover}
              fit={IMAGE_FIT}
              imageStream={stream}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {activeProjection ? (
            <EpisodeImageProjectionOverlay
              cameraModel={activeProjection.cameraModel}
              fit={IMAGE_FIT}
              imageHeight={activeProjection.imageDims.height}
              imageWidth={activeProjection.imageDims.width}
              layers={projectionLayers}
              pickerRef={projectionPickerRef}
              pointSize={pointCloudProjection.pointSize}
              sourceKey={sourceKey || "episode-session"}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {effectiveImageDims && selectedLabelStreams.length > 0 ? (
            <EpisodeImageAnnotationOverlay
              fit={IMAGE_FIT}
              imageWidth={effectiveImageDims.width}
              imageHeight={effectiveImageDims.height}
              interpolate={fidelityMode === "smooth"}
              pixelTransform={
                rectifiedViewActive
                  ? rectifiedDisplay?.pixelTransform
                  : undefined
              }
              streams={selectedLabelStreams}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          <EpisodeTileStatusBadge streams={activeStreams} />
        </div>
      ) : (
        <EpisodeTileEmptyState streams={stream ? [stream] : []} />
      )}
    </>
  );
};

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
            {...checkboxNoSpaceToggleProps}
          />
        ))}
      </div>
    </div>
  );
}

type ImageDimensions = { readonly height: number; readonly width: number };

function describeCalibrationSelection(
  explicitStream: string | null,
  automaticStream: string | null,
  sources: readonly { readonly id: string; readonly label: string }[],
): string {
  if (explicitStream) {
    return sourceLabel(sources, explicitStream);
  }
  return automaticStream
    ? `Auto · ${sourceLabel(sources, automaticStream)}`
    : "Auto · no match";
}

function sourceLabel(
  sources: readonly { readonly id: string; readonly label: string }[],
  stream: string,
): string {
  return sources.find((source) => source.id === stream)?.label ?? stream;
}

function describeCameraGeometry(
  resolution: EpisodeCameraModelResolution | null,
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
  geometry: EpisodeImageGeometryMode,
  resolution: EpisodeCameraModelResolution | null,
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
  calibrationStream,
  cameraModelResolution,
  display,
  explicitCalibrationAvailable,
  imageDims,
  rectifiedDisplay,
  rectifiedModelResolution,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationStream: string | null;
  readonly cameraModelResolution: EpisodeCameraModelResolution | null;
  readonly display: EpisodeImageDisplayMode;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly rectifiedDisplay: EpisodeRectifiedImageDisplay | null;
  readonly rectifiedModelResolution: EpisodeCameraModelResolution | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (display !== "rectified") return null;
  if (!calibrationStream) return "Rectified view needs a camera calibration";
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
  calibrationStream,
  cameraModelResolution,
  enabled,
  explicitCalibrationAvailable,
  imageDims,
  sourceDimensionMismatch,
}: {
  readonly calibration: CameraCalibrationVisualization | null;
  readonly calibrationStream: string | null;
  readonly cameraModelResolution: EpisodeCameraModelResolution | null;
  readonly enabled: boolean;
  readonly explicitCalibrationAvailable: boolean;
  readonly imageDims: ImageDimensions | null;
  readonly sourceDimensionMismatch: boolean;
}): string | null {
  if (!enabled) return null;
  if (!calibrationStream) {
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

export default EpisodeImageTile;
