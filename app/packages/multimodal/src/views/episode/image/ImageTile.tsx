import {
  useSetTileTitleHighlighted,
  useSetTileTitle,
  useTileDuplicator,
  useTileId,
} from "@fiftyone/tiling";
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
} from "../../../ir";
import { SCENE_SOURCE_METADATA, SCENE_SOURCE_TYPE } from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import { VISUALIZATION_KIND } from "../../../visualization";
import { ImagePanel } from "../../../visualization/media-2d/ImagePanel";
import { imageTextureCacheKey } from "../../../visualization/media-2d/image-texture-cache";
import type { PanelNotice } from "../../../visualization/panel-ui/PanelNotices";
import { useImagePanZoom } from "../../../visualization/media-2d/use-image-pan-zoom";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import { useDataStream } from "../playback/data-stream-context";
import { usePublishImageAspectRatio } from "./image-aspect-ratios";
import { groupImageLabelSources } from "./image-label-source-groups";
import {
  useImageProjection,
  usePlaybackSettings,
} from "../settings/modal/state";
import {
  useImageTileLabelStreams,
  useImageTilePointCloudProjection,
} from "../tiles/panel-visibility";
import {
  chooseNextImageStream,
  imageTileBindingsAtom,
  useHoveredFrustumImageStream,
  useImageTileHoverProps,
  usePublishImageTileBinding,
} from "../tiles/tile-source-bindings";
import ImageAnnotationOverlay from "./ImageAnnotationOverlay";
import DepthHoverOverlay from "./DepthHoverOverlay";
import ImageProjectionOverlay from "./ImageProjectionOverlay";
import ImageProjectionScene from "./ImageProjectionScene";
import { useHoverEcho } from "../interaction/point-hover/hover-echo";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import { rankDefaultImageSources } from "../layout/playback-layout";
import styles from "../tiles/Tile.module.css";
import { TileEmptyState, TileStatusBadge } from "../tiles/TileStreamState";
import type { EpisodeTileProps } from "../tiles/tile-types";
import {
  useStreamContentFrame,
  usePlaybackStreamValue,
} from "../playback/use-stream-values";
import { useVideoDecodeRunway } from "../playback/video-decode-runway/use-video-decode-runways";
import { useImageProjectionLayers } from "./use-image-projection-layers";
import {
  effectiveCameraCalibration,
  resolveCameraModel,
} from "../spatial/camera-geometry/camera-model";
import { resolveRectifiedImageDisplay } from "../spatial/camera-geometry/image-rectification";
import ImageTileSettings from "./ImageTileSettings";
import {
  describeCalibrationSelection,
  describeCameraGeometry,
  describeGeometryControl,
  getProjectionIssue,
  getRectifiedDisplayIssue,
} from "./image-camera-status";

const IMAGE_FIT = "contain";
const EMPTY_PROJECTION_STREAMS: readonly string[] = [];

/** Renders one image stream with labels, projections, and camera controls. */
const ImageTile: React.FC<EpisodeTileProps> = ({ initialSourceId }) => {
  const tileId = useTileId();
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const projectionPickerRef =
    useRef<GpuPointCloudProjectionPickerHandle | null>(null);
  const sharedHover = useHoverEcho();
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
  const { fidelityMode } = usePlaybackSettings();
  const setTileTitle = useSetTileTitle();
  const setTileTitleHighlighted = useSetTileTitleHighlighted();
  const hoveredFrustumImageStream = useHoveredFrustumImageStream();
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
        jotaiStore.get(imageTileBindingsAtom),
      ),
  );
  const { labelStreams: storedLabelStreams, setLabelStreams } =
    useImageTileLabelStreams(stream);
  const { projection: cameraProjection, setProjection: setCameraProjection } =
    useImageProjection(stream);
  const {
    projection: pointCloudProjection,
    setProjection: setPointCloudProjection,
  } = useImageTilePointCloudProjection(stream);

  // This effect binds the pane to the best undisplayed image source once
  // sources resolve.
  useEffect(() => {
    if (stream && images.some((source) => source.id === stream)) return;

    const nextStream = chooseNextImageStream(
      rankDefaultImageSources(images),
      jotaiStore.get(imageTileBindingsAtom),
    );
    if (nextStream !== stream) setStream(nextStream);
  }, [images, jotaiStore, stream]);

  // Advertise this tile's stream so spawn points know what's on screen.
  usePublishImageTileBinding(stream);
  // Hovering this tile lights up its camera frustum in the 3D scene.
  const hoverProps = useImageTileHoverProps(stream);

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
    render: () => <ImageTile initialSourceId={stream} />,
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
  const playbackFrame = useStreamContentFrame<ImageVisualization>(stream);
  const frame = playbackFrame?.frame ?? null;
  const decodeRunway = useVideoDecodeRunway(stream, playbackFrame);
  const sourceKey = useDataStream()?.sourceKey ?? "";
  // Shared texture key per (recording, stream, frame). The 3D tile's
  // frustum image planes form the same key, so both surfaces share one
  // decode and one GPU texture for the same camera frame.
  const textureKey =
    playbackFrame && sourceKey
      ? imageTextureCacheKey(sourceKey, stream, playbackFrame.contentTimeNs)
      : undefined;
  const selectedImageSource =
    images.find((source) => source.id === stream) ?? null;
  const annotationStreams = useMemo(
    () => annotationSources.map((source) => source.id),
    [annotationSources],
  );
  const labelSourceGroups = useMemo(
    () => groupImageLabelSources(selectedImageSource, annotationSources),
    [annotationSources, selectedImageSource],
  );
  const autoCalibrationStream =
    selectedImageSource?.metadata?.[
      SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID
    ] ?? null;
  const explicitCalibrationStream = cameraProjection.calibrationStream;
  const explicitCalibrationAvailable =
    !explicitCalibrationStream ||
    calibrationSources.some(
      (source) => source.id === explicitCalibrationStream,
    );
  const calibrationStream = explicitCalibrationStream ?? autoCalibrationStream;
  const calibration = usePlaybackStreamValue<CameraCalibrationVisualization>(
    calibrationStream ?? "",
  );
  const effectiveCalibration = useMemo(
    () => (calibration ? effectiveCameraCalibration(calibration) : null),
    [calibration],
  );
  const cameraModelResolution = useMemo(
    () =>
      calibration
        ? resolveCameraModel({
            calibration,
            geometry: cameraProjection.geometry,
            imageSourceName: selectedImageSource?.sourceName ?? "",
          })
        : null,
    [calibration, cameraProjection.geometry, selectedImageSource?.sourceName],
  );
  const rectifiedModelResolution = useMemo(
    () =>
      calibration
        ? resolveCameraModel({
            calibration,
            geometry: "rectified",
            imageSourceName: selectedImageSource?.sourceName ?? "",
          })
        : null,
    [calibration, selectedImageSource?.sourceName],
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
    return resolveRectifiedImageDisplay(
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
  usePublishImageAspectRatio(
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
  const projectionLayers = useImageProjectionLayers(
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
  const settingsRegistration = useMemo(
    () => ({
      content: (
        <ImageTileSettings
          annotationSources={annotationSources}
          annotationStreams={annotationStreams}
          calibrationSelectionLabel={calibrationSelectionLabel}
          calibrationSources={calibrationSources}
          cameraProjection={cameraProjection}
          canConfigureCameraGeometry={canConfigureCameraGeometry}
          geometryControlLabel={geometryControlLabel}
          geometryStatus={geometryStatus}
          images={images}
          labelSourceGroups={labelSourceGroups}
          pointCloudProjection={pointCloudProjection}
          pointCloudSources={pointCloudSources}
          selectedLabelStreams={selectedLabelStreams}
          selectedProjectionStreams={selectedProjectionStreams}
          setCameraProjection={setCameraProjection}
          setLabelStreams={setLabelStreams}
          setPointCloudProjection={setPointCloudProjection}
          setStream={setStream}
          stream={stream}
          toggleLabelStream={toggleLabelStream}
          toggleProjectionStream={toggleProjectionStream}
        />
      ),
      streamStreams: activeStreams,
    }),
    [
      activeStreams,
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
  useRegisterTileSettings(tileId, settingsRegistration);

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
                <ImageProjectionScene
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
            <DepthHoverOverlay
              {...activeDepthHover}
              fit={IMAGE_FIT}
              imageStream={stream}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {activeProjection ? (
            <ImageProjectionOverlay
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
            <ImageAnnotationOverlay
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
          <TileStatusBadge streams={activeStreams} />
        </div>
      ) : (
        <TileEmptyState streams={stream ? [stream] : []} />
      )}
    </>
  );
};

export default ImageTile;
