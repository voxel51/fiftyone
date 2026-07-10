import {
  TileSettingsContent,
  useSetTileTitle,
  useTileDuplicator,
} from "@fiftyone/tiling";
import {
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useStore } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import type {
  CameraCalibrationVisualization,
  ImageVisualization,
} from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  chooseAnnotationTopic,
  chooseCalibrationTopic,
} from "../topic-matching";
import { ImagePanel } from "../../../visualization/panels/image";
import { imageTextureCacheKey } from "../../../visualization/panels/image-texture-cache";
import { useImagePanZoom } from "../../../visualization/panels/use-image-pan-zoom";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  MAX_MCAP_POINT_CLOUD_POINT_SIZE,
  MCAP_POINT_CLOUD_POINT_SIZE_STEP,
  MIN_MCAP_POINT_CLOUD_POINT_SIZE,
  useMcapImageLabelTopics,
  useMcapImageProjection,
  useMcapPlaybackSettings,
} from "./mcap-modal-settings";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import {
  chooseNextImageTopic,
  mcapImageTileBindingsAtom,
  useMcapImageTileHoverProps,
  usePublishMcapImageTileBinding,
} from "./mcap-tile-source-bindings";
import McapImageAnnotationOverlay from "./McapImageAnnotationOverlay";
import McapImageProjectionOverlay from "./McapImageProjectionOverlay";
import McapSidebarGroup from "./McapSidebarGroup";
import { rankDefaultImageSources } from "./playback-layout";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import type { McapTileProps } from "./mcap-tile-types";
import {
  useMcapTopicPlaybackFrame,
  useMcapTopicStream,
} from "./use-mcap-topic-stream";

const IMAGE_FIT = "contain";

const McapImageTile: React.FC<McapTileProps> = ({ initialSourceId }) => {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
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
  const {
    hasExplicitLabelTopics,
    labelTopics: storedLabelTopics,
    setLabelTopics,
  } = useMcapImageLabelTopics(topic);

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
  const playbackFrame = useMcapTopicPlaybackFrame<ImageVisualization>(topic);
  const frame = playbackFrame?.frame ?? null;
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
  const calibrationTopic = useMemo(
    () =>
      topic
        ? chooseCalibrationTopic(
            topic,
            calibrationSources.map((s) => s.id),
          )
        : null,
    [calibrationSources, topic],
  );
  const calibration = useMcapTopicStream<CameraCalibrationVisualization>(
    calibrationTopic ?? "",
  );
  // Calibration supplies authoritative dimensions before the first image
  // decodes, so annotation overlays and pan/zoom get the right aspect
  // immediately; the loaded image stays authoritative afterwards.
  const effectiveImageDims = useMemo(() => {
    if (imageDims) {
      return imageDims;
    }
    if (calibration && calibration.width > 0 && calibration.height > 0) {
      return { height: calibration.height, width: calibration.width };
    }
    return null;
  }, [calibration, imageDims]);
  const inferredAnnotationTopic = useMemo(
    () => (topic ? chooseAnnotationTopic(topic, annotationTopics) : null),
    [topic, annotationTopics],
  );
  const selectedLabelTopics = useMemo(() => {
    if (!topic) return [];
    if (hasExplicitLabelTopics) {
      const available = new Set(annotationTopics);
      return storedLabelTopics.filter((labelTopic) =>
        available.has(labelTopic),
      );
    }
    return inferredAnnotationTopic ? [inferredAnnotationTopic] : [];
  }, [
    annotationTopics,
    hasExplicitLabelTopics,
    inferredAnnotationTopic,
    storedLabelTopics,
    topic,
  ]);
  const activeTopics = useMemo(
    () => (topic ? [topic, ...selectedLabelTopics] : []),
    [selectedLabelTopics, topic],
  );
  const { projection, setProjection } = useMcapImageProjection(topic);
  const pointCloudTopics = useMemo(
    () => pointCloudSources.map((s) => s.id),
    [pointCloudSources],
  );
  const selectedProjectionTopics = useMemo(() => {
    if (!projection.enabled) return [];
    if (projection.topics === null) return pointCloudTopics;
    const available = new Set(pointCloudTopics);
    return projection.topics.filter((cloudTopic) => available.has(cloudTopic));
  }, [pointCloudTopics, projection.enabled, projection.topics]);
  const activeProjection =
    effectiveImageDims &&
    projection.enabled &&
    calibration &&
    selectedProjectionTopics.length > 0
      ? { calibration, imageDims: effectiveImageDims }
      : null;
  const imagePanZoom = useImagePanZoom({
    fit: IMAGE_FIT,
    // The resting hand cursor would occlude the very dot a dwell hover
    // inspects; a crosshair pinpoints it. Dragging still shows "grabbing".
    idleCursor: activeProjection ? "crosshair" : undefined,
    imageSize: effectiveImageDims,
    resetKey: topic,
  });
  const currentLabel =
    images.find((s) => s.id === topic)?.label ?? "Select source";
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
    setProjection({ enabled: topics.length > 0, topics });
  };
  const canProjectPointClouds =
    pointCloudSources.length > 0 && calibrationTopic !== null;

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <McapSidebarGroup title="Source">
            <Dropdown
              anchor={DropdownAnchor.BottomStart}
              trigger={<DropdownTrigger>{currentLabel}</DropdownTrigger>}
            >
              {images.map((s) => (
                <MenuTextItem
                  key={s.id}
                  onClick={() => {
                    setTopic(s.id);
                    setTileTitle(s.label, { source: "auto" });
                  }}
                >
                  {s.label}
                </MenuTextItem>
              ))}
            </Dropdown>
          </McapSidebarGroup>
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
              <div className={settingsStyles.optionStack}>
                {annotationSources.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={s.label}
                    checked={selectedLabelTopics.includes(s.id)}
                    onChange={(checked) => toggleLabelTopic(s.id, checked)}
                    {...checkboxNoSpaceToggleProps}
                  />
                ))}
              </div>
            </McapSidebarGroup>
          ) : null}
          {canProjectPointClouds ? (
            <McapSidebarGroup
              summary={`${selectedProjectionTopics.length} of ${pointCloudSources.length} on`}
              title="Pointcloud projections"
              toggle={{
                ariaLabel: "Toggle pointcloud projections",
                checked: selectedProjectionTopics.length > 0,
                // Master toggle drives the children: on selects every
                // cloud, off unchecks them all.
                onChange: (checked) =>
                  setProjection(
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
                      setProjection({
                        pointSize: Math.min(
                          MAX_MCAP_POINT_CLOUD_POINT_SIZE,
                          Math.max(MIN_MCAP_POINT_CLOUD_POINT_SIZE, next),
                        ),
                      });
                    }
                  }}
                  step={MCAP_POINT_CLOUD_POINT_SIZE_STEP}
                  type="number"
                  value={projection.pointSize}
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
            textureKey={textureKey}
            viewTransform={imagePanZoom.viewTransform}
          />
          {activeProjection ? (
            <McapImageProjectionOverlay
              calibration={activeProjection.calibration}
              fit={IMAGE_FIT}
              imageHeight={activeProjection.imageDims.height}
              imageWidth={activeProjection.imageDims.width}
              pointSize={projection.pointSize}
              topics={selectedProjectionTopics}
              viewTransform={imagePanZoom.viewTransform}
            />
          ) : null}
          {effectiveImageDims && selectedLabelTopics.length > 0 ? (
            <McapImageAnnotationOverlay
              fit={IMAGE_FIT}
              imageWidth={effectiveImageDims.width}
              imageHeight={effectiveImageDims.height}
              interpolate={fidelityMode === "smooth"}
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

export default McapImageTile;
