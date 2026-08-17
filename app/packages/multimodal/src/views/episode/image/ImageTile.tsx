import {
  useSetTileTitleHighlighted,
  useSetTileTitle,
  useTileDuplicator,
  useTileId,
} from "@fiftyone/tiling";
import { useIsPlaying } from "@fiftyone/playback";
import { useStore } from "jotai";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublishAnnotationStreams } from "../../../extensions/timeline";
import type {
  CameraVisualization,
  CameraCalibrationVisualization,
} from "../../../ir";
import { SCENE_SOURCE_METADATA, SCENE_SOURCE_TYPE } from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import { VISUALIZATION_KIND } from "../../../visualization";
import { ImagePanel } from "../../../visualization/media-2d/ImagePanel";
import { VideoPanel } from "../../../visualization/media-2d/VideoPanel";
import { BitmapImageFrameView } from "../../../visualization/media-2d/BitmapImageView";
import GpuImageAnnotationLayer from "../../../visualization/media-2d/GpuImageAnnotationLayer";
import { GpuImageAnnotationPicker } from "../../../visualization/media-2d/GpuImageAnnotationPicker";
import { imageTextureCacheKey } from "../../../visualization/media-2d/image-texture-cache";
import type { PanelNotice } from "../../../visualization/panel-ui/PanelNotices";
import { useImagePanZoom } from "../../../visualization/media-2d/use-image-pan-zoom";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import { useDataStream } from "../playback/data-stream-context";
import { usePublishImageAspectRatio } from "./image-aspect-ratios";
import { groupImageLabelSources } from "./image-label-source-groups";
import { useImageProjection } from "../settings/modal/state";
import {
  useImageTile3dLabelProjection,
  useImageTileLabelStreams,
  useImageTilePointCloudProjection,
  useSidebarSourceIdentity,
} from "../tiles/panel-visibility";
import {
  chooseNextImageStream,
  imageTileBindingsAtom,
  persistedImageTileBindingsAtom,
  resolveAvailableImageStream,
  useHoveredFrustumImageStream,
  useImageTileHoverProps,
  usePersistImageTileBinding,
  usePreferredImageTileStream,
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
import {
  TileEmptyState,
  TileStatusBadge,
  useTileStreamWarningNotices,
} from "../tiles/TileStreamState";
import type { EpisodeTileProps } from "../tiles/tile-types";
import {
  useStreamContentFrame,
  usePlaybackStreamValue,
} from "../playback/use-stream-values";
import { useImageProjectionLayers } from "./use-image-projection-layers";
import {
  classifyImageDimensions,
  effectiveCameraCalibration,
  resolveCameraModel,
} from "../spatial/camera-geometry/camera-model";
import { resolveRectifiedImageDisplay } from "../spatial/camera-geometry/image-rectification";
import ImageTileSettings from "./ImageTileSettings";
import { useImageAnnotationLayer } from "./use-image-annotation-layer";
import { useProjectedSceneAnnotations } from "./use-projected-scene-annotations";
import {
  describeCalibrationSelection,
  describeCameraGeometry,
  describeGeometryControl,
  getCalibrationAdaptationStatus,
  getImageViewStatus,
  getProjectionNotice,
  getRectifiedDisplayIssue,
} from "./image-camera-status";
import { projectionStreamsForHover } from "./hover-projection-streams";
import { useSourcePoster } from "./source-poster-context";
import { shouldPresentDestinationPoster } from "./destination-poster";

const IMAGE_FIT = "contain";
const EMPTY_PROJECTION_STREAMS: readonly string[] = [];

/** Renders one image stream with labels, projections, and camera controls. */
const ImageTile: React.FC<EpisodeTileProps> = ({ initialSourceId }) => {
  const tileId = useTileId();
  const isPlaying = useIsPlaying();
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [committedImage, setCommittedImage] = useState<{
    contentTimeNs: bigint;
    sourceKey: string;
    stream: string;
  } | null>(null);
  const [committedPosterKey, setCommittedPosterKey] = useState("");
  const projectionPickerRef =
    useRef<GpuPointCloudProjectionPickerHandle | null>(null);
  const sharedHover = useHoverEcho();
  const sourcePoster = useSourcePoster();
  const images = useSceneSourcesByType(SCENE_SOURCE_TYPE.IMAGE);
  const sourceIdentity = useSidebarSourceIdentity();
  const preferredImageTileStream = usePreferredImageTileStream();
  const annotationSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
  );
  const calibrationSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.CAMERA_CALIBRATION,
  );
  const pointCloudSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.POINT_CLOUD,
  );
  const sceneAnnotationSources = useSceneSourcesByType(
    SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
  );
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
  const persistImageTileBinding = usePersistImageTileBinding(stream);
  const selectStream = useCallback(
    (nextStream: string) => {
      persistImageTileBinding(nextStream);
      setStream(nextStream);
    },
    [persistImageTileBinding],
  );
  const { labelStreams: storedLabelStreams, setLabelStreams } =
    useImageTileLabelStreams(stream);
  const { projection: label3dProjection, setProjection: setLabel3dProjection } =
    useImageTile3dLabelProjection(stream);
  const { projection: cameraProjection, setProjection: setCameraProjection } =
    useImageProjection(stream);
  const {
    projection: pointCloudProjection,
    setProjection: setPointCloudProjection,
  } = useImageTilePointCloudProjection(stream);

  // This effect restores a returning durable preference or temporarily falls
  // back when the current sample lacks it. Automatic fallback never writes
  // the preference, so a later sample can restore the user's chosen source.
  useEffect(() => {
    const preferredStream =
      preferredImageTileStream ??
      (tileId
        ? jotaiStore.get(persistedImageTileBindingsAtom)[tileId]
        : undefined);
    const nextStream = resolveAvailableImageStream(
      stream,
      preferredStream,
      images,
      rankDefaultImageSources(images),
      jotaiStore.get(imageTileBindingsAtom),
    );
    if (nextStream !== stream) setStream(nextStream);
  }, [images, jotaiStore, preferredImageTileStream, stream, tileId]);

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
  const playbackFrame = useStreamContentFrame<CameraVisualization>(stream);
  const frame = playbackFrame?.frame ?? null;
  const sourceKey = useDataStream()?.sourceKey ?? "";
  const previousDataStreamSourceKeyRef = useRef(sourceKey);
  // This layout effect clears the transition latch when the provider unbinds
  // the outgoing stream, so rapid A -> B -> A navigation can present A's
  // poster again even when B never committed a frame.
  useLayoutEffect(() => {
    if (previousDataStreamSourceKeyRef.current === sourceKey) return;
    previousDataStreamSourceKeyRef.current = sourceKey;
    setCommittedImage(null);
    setCommittedPosterKey("");
    setImageDims(null);
  }, [sourceKey]);
  // Shared texture key per (recording, stream, frame). The 3D tile's
  // frustum image planes form the same key, so both surfaces share one
  // decode and one GPU texture for the same camera frame.
  const textureKey =
    playbackFrame && sourceKey && frame?.kind !== "encoded-video"
      ? imageTextureCacheKey(sourceKey, stream, playbackFrame.contentTimeNs)
      : undefined;
  const requestedImageContentTimeNs = playbackFrame?.contentTimeNs ?? null;
  // Image decoding is asynchronous and deliberately keeps the previous texture
  // visible. Hold projections at that texture's timestamp until its replacement
  // commits so geometry never advances over stale pixels.
  const committedImageContentTimeNs =
    playbackFrame &&
    committedImage?.sourceKey === sourceKey &&
    committedImage.stream === stream
      ? committedImage.contentTimeNs
      : null;
  const updateImageDimensions = useCallback((width: number, height: number) => {
    setImageDims((previous) =>
      previous?.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);
  const handleImageLoaded = useCallback(
    (width: number, height: number) => {
      if (requestedImageContentTimeNs !== null) {
        setCommittedImage({
          contentTimeNs: requestedImageContentTimeNs,
          sourceKey,
          stream,
        });
      }
      updateImageDimensions(width, height);
    },
    [requestedImageContentTimeNs, sourceKey, stream, updateImageDimensions],
  );
  const destinationPoster =
    sourcePoster &&
    shouldPresentDestinationPoster({
      committedSourceKey: committedImage?.sourceKey ?? null,
      committedStream: committedImage?.stream ?? null,
      dataStreamSourceKey: sourceKey,
      posterSourceKey: sourcePoster.sourceKey,
      posterStreamId: sourcePoster.streamId,
      stream,
    })
      ? sourcePoster.frame
      : null;
  const posterSessionKey = useMemo(
    () => `${sourcePoster?.sourceKey ?? ""}\n${stream}`,
    [sourcePoster?.sourceKey, stream],
  );
  const destinationPosterKey = destinationPoster ? posterSessionKey : null;
  const handleDestinationPosterLoaded = useCallback(() => {
    // Poster decode is only a display-ready edge. Real stream frames remain
    // authoritative for calibration, annotations, and projection geometry.
    if (destinationPosterKey) setCommittedPosterKey(destinationPosterKey);
  }, [destinationPosterKey]);
  const selectedImageSource =
    images.find((source) => source.id === stream) ?? null;
  const annotationStreams = useMemo(
    () => annotationSources.map((source) => source.id),
    [annotationSources],
  );
  const sceneAnnotationStreams = useMemo(
    () => sceneAnnotationSources.map((source) => source.id),
    [sceneAnnotationSources],
  );
  const annotationSourceLabelsById = useMemo(
    () =>
      new Map(
        [...annotationSources, ...sceneAnnotationSources].map(
          (source) => [source.id, source.label] as const,
        ),
      ),
    [annotationSources, sceneAnnotationSources],
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
  const dimensionCompatibility =
    imageDims && effectiveCalibration
      ? classifyImageDimensions(imageDims, effectiveCalibration)
      : null;
  const modelImageDimensions =
    imageDims &&
    (dimensionCompatibility === "exact" ||
      dimensionCompatibility === "proportional")
      ? imageDims
      : undefined;
  const cameraModelResolution = useMemo(
    () =>
      calibration
        ? resolveCameraModel({
            calibration,
            geometry: cameraProjection.geometry,
            imageDimensions: modelImageDimensions,
            imageSourceName: selectedImageSource?.sourceName ?? "",
          })
        : null,
    [
      calibration,
      cameraProjection.geometry,
      modelImageDimensions,
      selectedImageSource?.sourceName,
    ],
  );
  const rectifiedModelResolution = useMemo(
    () =>
      calibration
        ? resolveCameraModel({
            calibration,
            geometry: "rectified",
            imageDimensions: modelImageDimensions,
            imageSourceName: selectedImageSource?.sourceName ?? "",
          })
        : null,
    [calibration, modelImageDimensions, selectedImageSource?.sourceName],
  );
  const sourceDimensionMismatch = dimensionCompatibility === "mismatch";
  const projectionDimensionMismatch = dimensionCompatibility === "mismatch";
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
  const annotationPixelTransform = rectifiedViewActive
    ? rectifiedDisplay?.pixelTransform
    : undefined;
  const selectedSceneAnnotationStreams = useMemo(() => {
    if (!label3dProjection.enabled) return [];
    if (label3dProjection.streams === null) return sceneAnnotationStreams;
    const available = new Set(sceneAnnotationStreams);
    return label3dProjection.streams.filter((annotationStream) =>
      available.has(annotationStream),
    );
  }, [
    label3dProjection.enabled,
    label3dProjection.streams,
    sceneAnnotationStreams,
  ]);
  const projectedSceneAnnotations = useProjectedSceneAnnotations({
    cameraFrameId:
      !projectionDimensionMismatch && playbackFrame
        ? calibration?.coordinateFrameId
        : null,
    cameraModel: !projectionDimensionMismatch ? sourceCameraModel : null,
    imageContentTimeNs: committedImageContentTimeNs,
    interpolate: label3dProjection.interpolate,
    outputHeight: effectiveImageDims?.height,
    outputWidth: effectiveImageDims?.width,
    streams: selectedSceneAnnotationStreams,
  });
  const imageAnnotations = useImageAnnotationLayer({
    additionalSets: projectedSceneAnnotations.sets,
    pixelTransform: annotationPixelTransform,
    resourceKey: `${sourceKey || "episode-session"}\n${tileId}\n${stream}`,
    streams: selectedLabelStreams,
  });
  const activeImageAnnotations = Boolean(
    effectiveImageDims && imageAnnotations.hasGeometry,
  );
  const publishedAnnotationStreams = useMemo(
    () => [
      ...selectedLabelStreams,
      ...selectedSceneAnnotationStreams.filter(
        (annotationStream) => !selectedLabelStreams.includes(annotationStream),
      ),
    ],
    [selectedLabelStreams, selectedSceneAnnotationStreams],
  );
  usePublishAnnotationStreams(publishedAnnotationStreams);
  const activeStreams = useMemo(
    () => (stream ? [stream, ...publishedAnnotationStreams] : []),
    [publishedAnnotationStreams, stream],
  );
  const streamWarningNotices = useTileStreamWarningNotices(activeStreams);
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
  const projectionGeometry =
    effectiveImageDims &&
    playbackFrame &&
    committedImageContentTimeNs !== null &&
    calibration &&
    calibration.coordinateFrameId &&
    displayCameraModel &&
    !projectionDimensionMismatch
      ? {
          cameraFrameId: calibration.coordinateFrameId,
          cameraModel: displayCameraModel,
          imageContentTimeNs: committedImageContentTimeNs,
          imageDims: effectiveImageDims,
        }
      : null;
  const activeProjection =
    projectionGeometry &&
    pointCloudProjection.enabled &&
    selectedProjectionStreams.length > 0
      ? projectionGeometry
      : null;
  const hasActiveProjection = activeProjection !== null;
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
  const hoverProjectionStream =
    sharedHover?.kind === "point" ? sharedHover.stream : null;
  const projectionSceneStreams = useMemo(
    () =>
      projectionStreamsForHover(
        hasActiveProjection ? selectedProjectionStreams : [],
        pointCloudStreams,
        hoverProjectionStream,
      ),
    [
      hasActiveProjection,
      hoverProjectionStream,
      pointCloudStreams,
      selectedProjectionStreams,
    ],
  );
  const projectionScene =
    projectionGeometry && projectionSceneStreams.length > 0
      ? projectionGeometry
      : null;
  const projectionLayers = useImageProjectionLayers(
    projectionSceneStreams,
    projectionScene?.cameraFrameId,
    projectionScene?.imageContentTimeNs,
  );
  const renderedProjectionLayers = useMemo(() => {
    if (!hasActiveProjection) {
      return [];
    }
    const rendered = new Set(selectedProjectionStreams);
    return projectionLayers.filter((layer) => rendered.has(layer.stream));
  }, [hasActiveProjection, projectionLayers, selectedProjectionStreams]);
  const imagePanZoom = useImagePanZoom({
    fit: IMAGE_FIT,
    // The resting hand cursor would occlude the very dot a dwell hover
    // inspects; a crosshair pinpoints it. Dragging still shows "grabbing".
    idleCursor:
      activeProjection || activeDepthHover || activeImageAnnotations
        ? "crosshair"
        : undefined,
    imageSize: effectiveImageDims,
    resetKey: `${stream}\n${cameraProjection.display}\n${rectifiedViewActive}`,
  });
  const toggleLabelStream = useCallback(
    (labelStream: string, checked: boolean) => {
      if (!stream) return;
      const next = new Set(selectedLabelStreams);
      const key = sourceIdentity.keyForRuntimeId(labelStream);
      for (const id of key
        ? sourceIdentity.runtimeIdsForKey(key)
        : [labelStream]) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      setLabelStreams(
        annotationStreams.filter((availableStream) =>
          next.has(availableStream),
        ),
      );
    },
    [
      annotationStreams,
      selectedLabelStreams,
      setLabelStreams,
      sourceIdentity,
      stream,
    ],
  );
  const toggleProjectionStream = useCallback(
    (cloudStream: string, checked: boolean) => {
      const next = new Set(selectedProjectionStreams);
      const key = sourceIdentity.keyForRuntimeId(cloudStream);
      for (const id of key
        ? sourceIdentity.runtimeIdsForKey(key)
        : [cloudStream]) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      const streams = pointCloudStreams.filter((availableStream) =>
        next.has(availableStream),
      );
      setPointCloudProjection({ enabled: streams.length > 0, streams });
    },
    [
      pointCloudStreams,
      selectedProjectionStreams,
      setPointCloudProjection,
      sourceIdentity,
    ],
  );
  const toggleSceneAnnotationStream = useCallback(
    (annotationStream: string, checked: boolean) => {
      const next = new Set(selectedSceneAnnotationStreams);
      const key = sourceIdentity.keyForRuntimeId(annotationStream);
      for (const id of key
        ? sourceIdentity.runtimeIdsForKey(key)
        : [annotationStream]) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      const streams = sceneAnnotationStreams.filter((availableStream) =>
        next.has(availableStream),
      );
      setLabel3dProjection({ enabled: streams.length > 0, streams });
    },
    [
      sceneAnnotationStreams,
      selectedSceneAnnotationStreams,
      setLabel3dProjection,
      sourceIdentity,
    ],
  );
  const canProjectPointClouds = pointCloudSources.length > 0;
  const canProject3dLabels = sceneAnnotationSources.length > 0;
  const canConfigureCameraGeometry =
    calibrationSources.length > 0 ||
    canProjectPointClouds ||
    canProject3dLabels;
  const calibrationSelectionLabel = describeCalibrationSelection(
    cameraProjection.calibrationStream,
    autoCalibrationStream,
    calibrationSources,
  );
  const geometryStatus = describeCameraGeometry(cameraModelResolution);
  const calibrationAdaptationStatus = useMemo(
    () =>
      getCalibrationAdaptationStatus({
        calibrationDims: effectiveCalibration,
        dimensionCompatibility:
          cameraModelResolution?.status === "ready"
            ? dimensionCompatibility
            : null,
        imageDims,
      }),
    [
      cameraModelResolution?.status,
      dimensionCompatibility,
      effectiveCalibration,
      imageDims,
    ],
  );
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
  const viewStatus = useMemo(
    () =>
      getImageViewStatus({
        cameraModelResolution,
        display: cameraProjection.display,
        issue: rectifiedDisplayIssue,
      }),
    [cameraModelResolution, cameraProjection.display, rectifiedDisplayIssue],
  );
  const projectionNotice = useMemo(
    () =>
      getProjectionNotice({
        calibration,
        calibrationStream,
        cameraModelResolution,
        dimensionCompatibility,
        enabled:
          (pointCloudProjection.enabled &&
            selectedProjectionStreams.length > 0) ||
          (label3dProjection.enabled &&
            selectedSceneAnnotationStreams.length > 0),
        explicitCalibrationAvailable,
        imageDims,
      }),
    [
      calibration,
      calibrationStream,
      cameraModelResolution,
      dimensionCompatibility,
      explicitCalibrationAvailable,
      imageDims,
      label3dProjection.enabled,
      pointCloudProjection.enabled,
      selectedSceneAnnotationStreams.length,
      selectedProjectionStreams.length,
    ],
  );
  const geometryControlLabel = describeGeometryControl(
    cameraProjection.geometry,
    cameraModelResolution,
  );
  const imageNotices = useMemo<readonly PanelNotice[]>(() => {
    const visibleNotice = rectifiedDisplayIssue
      ? { message: rectifiedDisplayIssue, severity: "warning" as const }
      : projectionNotice;
    return visibleNotice
      ? [
          ...streamWarningNotices,
          {
            id: "episode-image-projection",
            ...visibleNotice,
          },
        ]
      : streamWarningNotices;
  }, [projectionNotice, rectifiedDisplayIssue, streamWarningNotices]);
  const settingsRegistration = useMemo(
    () => ({
      content: (
        <ImageTileSettings
          annotationSources={annotationSources}
          annotationStreams={annotationStreams}
          calibrationAdaptationStatus={calibrationAdaptationStatus}
          calibrationSelectionLabel={calibrationSelectionLabel}
          calibrationSources={calibrationSources}
          cameraProjection={cameraProjection}
          canConfigureCameraGeometry={canConfigureCameraGeometry}
          geometryControlLabel={geometryControlLabel}
          geometryStatus={geometryStatus}
          hasCalibrationMatch={Boolean(calibrationStream)}
          images={images}
          labelSourceGroups={labelSourceGroups}
          label3dProjection={label3dProjection}
          pointCloudProjection={pointCloudProjection}
          pointCloudSources={pointCloudSources}
          sceneAnnotationSources={sceneAnnotationSources}
          selectedLabelStreams={selectedLabelStreams}
          selectedProjectionStreams={selectedProjectionStreams}
          selectedSceneAnnotationStreams={selectedSceneAnnotationStreams}
          setCameraProjection={setCameraProjection}
          setLabel3dProjection={setLabel3dProjection}
          setLabelStreams={setLabelStreams}
          setPointCloudProjection={setPointCloudProjection}
          setStream={selectStream}
          stream={stream}
          toggleLabelStream={toggleLabelStream}
          toggleProjectionStream={toggleProjectionStream}
          toggleSceneAnnotationStream={toggleSceneAnnotationStream}
          viewStatus={viewStatus}
        />
      ),
      streamStreams: activeStreams,
    }),
    [
      activeStreams,
      annotationSources,
      annotationStreams,
      calibrationAdaptationStatus,
      calibrationSelectionLabel,
      calibrationSources,
      calibrationStream,
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
      selectStream,
      setCameraProjection,
      setLabel3dProjection,
      setLabelStreams,
      setPointCloudProjection,
      stream,
      toggleLabelStream,
      toggleProjectionStream,
      toggleSceneAnnotationStream,
      viewStatus,
    ],
  );
  useRegisterTileSettings(tileId, settingsRegistration);
  const panelSceneChildren = useMemo(
    () =>
      projectionScene || activeImageAnnotations ? (
        <>
          {projectionScene ? (
            <ImageProjectionScene
              cameraModel={projectionScene.cameraModel}
              fit={IMAGE_FIT}
              imageHeight={projectionScene.imageDims.height}
              imageWidth={projectionScene.imageDims.width}
              hoveredPoint={sharedHover}
              layers={projectionLayers}
              pointSize={pointCloudProjection.pointSize}
              ref={projectionPickerRef}
              renderedStreams={
                activeProjection
                  ? selectedProjectionStreams
                  : EMPTY_PROJECTION_STREAMS
              }
              sourceKey={sourceKey || "episode-session"}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {activeImageAnnotations && effectiveImageDims ? (
            <>
              <GpuImageAnnotationLayer
                fit={IMAGE_FIT}
                imageHeight={effectiveImageDims.height}
                imageWidth={effectiveImageDims.width}
                resource={imageAnnotations.resource}
                viewTransform={imagePanZoom.viewTransform}
              />
              <GpuImageAnnotationLayer
                fit={IMAGE_FIT}
                imageHeight={effectiveImageDims.height}
                imageWidth={effectiveImageDims.width}
                renderOrder={30}
                resource={imageAnnotations.highlightResource}
                viewTransform={imagePanZoom.viewTransform}
              />
              <GpuImageAnnotationPicker
                imageHeight={effectiveImageDims.height}
                imageWidth={effectiveImageDims.width}
                ref={imageAnnotations.pickerRef}
                resource={imageAnnotations.resource}
              />
            </>
          ) : null}
        </>
      ) : undefined,
    [
      activeImageAnnotations,
      activeProjection,
      effectiveImageDims,
      imageAnnotations.highlightResource,
      imageAnnotations.pickerRef,
      imageAnnotations.resource,
      imagePanZoom.viewTransform,
      pointCloudProjection.pointSize,
      projectionLayers,
      projectionPickerRef,
      projectionScene,
      selectedProjectionStreams,
      sharedHover,
      sourceKey,
    ],
  );

  return (
    <>
      {(frame && playbackFrame) || destinationPoster ? (
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
          {frame && playbackFrame ? (
            frame.kind === "encoded-video" ? (
              frame.codec === "h264" ? (
                <VideoPanel
                  canvasSurface="modal-image"
                  className={styles.panel}
                  fit={IMAGE_FIT}
                  frame={frame}
                  notices={imageNotices}
                  onImageLoaded={handleImageLoaded}
                  onResetView={imagePanZoom.resetView}
                  priority={isPlaying ? "playing" : "visible"}
                  sceneChildren={panelSceneChildren}
                  stream={stream}
                  targetTimeNs={playbackFrame.contentTimeNs}
                  textureMesh={
                    rectifiedViewActive ? rectifiedDisplay?.textureMesh : null
                  }
                  viewTransform={imagePanZoom.viewTransform}
                />
              ) : (
                <div className={styles.panel} role="alert">
                  Video codec {frame.codec} is unsupported
                </div>
              )
            ) : (
              <ImagePanel
                canvasSurface="modal-image"
                className={styles.panel}
                fit={IMAGE_FIT}
                frame={frame}
                notices={imageNotices}
                onImageLoaded={handleImageLoaded}
                onResetView={imagePanZoom.resetView}
                sceneChildren={panelSceneChildren}
                textureMesh={
                  rectifiedViewActive ? rectifiedDisplay?.textureMesh : null
                }
                textureKey={textureKey}
                viewTransform={imagePanZoom.viewTransform}
              />
            )
          ) : null}
          {destinationPoster ? (
            <div
              className={styles.destinationPoster}
              data-episode-destination-poster=""
              data-episode-destination-poster-ready={
                committedPosterKey === destinationPosterKey || undefined
              }
              data-testid="episode-destination-poster"
            >
              <BitmapImageFrameView
                className={styles.panel}
                fit={IMAGE_FIT}
                frame={destinationPoster}
                onImageLoaded={handleDestinationPosterLoaded}
                videoSessionKey={posterSessionKey}
              />
            </div>
          ) : null}
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
              cameraFrameId={activeProjection.cameraFrameId}
              cameraModel={activeProjection.cameraModel}
              fit={IMAGE_FIT}
              imageHeight={activeProjection.imageDims.height}
              imageContentTimeNs={activeProjection.imageContentTimeNs}
              imageStream={stream}
              imageWidth={activeProjection.imageDims.width}
              layers={renderedProjectionLayers}
              pickerRef={projectionPickerRef}
              pointSize={pointCloudProjection.pointSize}
              sourceKey={sourceKey || "episode-session"}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {activeImageAnnotations && effectiveImageDims ? (
            <ImageAnnotationOverlay
              fit={IMAGE_FIT}
              imageWidth={effectiveImageDims.width}
              imageHeight={effectiveImageDims.height}
              onHoverPrimitive={imageAnnotations.setHoveredPrimitiveIndex}
              onSelectPrimitive={imageAnnotations.selectPrimitive}
              pickerRef={imageAnnotations.pickerRef}
              prepared={imageAnnotations.prepared}
              sourceLabelsById={annotationSourceLabelsById}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          <TileStatusBadge showWarnings={false} streams={activeStreams} />
        </div>
      ) : (
        <TileEmptyState streams={stream ? [stream] : []} />
      )}
    </>
  );
};

export default ImageTile;
