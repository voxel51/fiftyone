import {
  humanReadableBytes,
  markModalLoadingLatencyEvent,
  markModalLoadingLatencyEventAfterPaint,
} from "@fiftyone/utilities";
import type { TilingLayoutMetrics } from "@fiftyone/tiling";
import type { TemporalTagTimelineProps, Track } from "@fiftyone/playback";
import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import type { StreamInventory } from "../../../schemas/v1";
import { releaseRetainedImageTextures } from "../../../visualization/panels/image-texture-cache";
import {
  releaseGpuPointCloudProjectionResources,
  releaseGpuPointCloudProjectionResourcesForSource,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection-resources";
import { releaseGpuPointCloudColormapTextures } from "../../../visualization/panels/point-cloud/gpu/gpu-point-cloud-colormap-texture";
import { BitmapImageFrameView } from "../../../visualization/panels/bitmap-image-view";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { getMcapSourceBootstrap } from "../source-bootstrap-cache";
import type { McapResourceClient } from "../types";
import { Mcap3dViewStateProvider } from "./mcap-3d-view-state-context";
import { Mcap3dViewSettingsProvider } from "./mcap-3d-view-settings-context";
import { Mcap3dViewpointProvider } from "./mcap-3d-viewpoint-context";
import { mcapCameraScopeKey } from "./mcap-camera-scope";
import {
  McapDataStreamProvider,
  useMcapDataStream,
} from "./mcap-data-stream-context";
import { McapFrameTransformsProvider } from "./mcap-frame-transforms-context";
import { McapImageAspectRatioProvider } from "./mcap-image-aspect-ratios";
import { McapLogConsoleProvider } from "./mcap-log-console-context";
import { McapLocationTracksProvider } from "./mcap-location-tracks-context";
import { McapMapViewportScopeProvider } from "./mcap-map-viewport-cache";
import { McapNumericSeriesProvider } from "./mcap-numeric-series-context";
import { McapPoseTrajectoriesProvider } from "./mcap-pose-trajectories-context";
import { McapRawMessageProvider } from "./mcap-raw-message-context";
import { McapSceneUpdateHistoryProvider } from "./mcap-scene-update-history-context";
import { McapSelectionHotkeys } from "./mcap-selected-object";
import McapAddTileMenu from "./McapAddTileMenu";
import McapInspectorSidebar from "./McapInspectorSidebar";
import styles from "./McapModalRenderer.module.css";
import {
  McapNetworkHealthTracker,
  McapNetworkStatusPill,
} from "./McapNetworkStatus";
import { McapPausedByteBanking } from "./McapPausedByteBanking";
import { McapPanelVisibilityProvider } from "./mcap-panel-visibility";
import McapSettingsSidebar from "./McapSettingsSidebar";
import { McapStreams } from "./McapStreams";
import McapTimestampReadout from "./McapTimestampReadout";
import {
  buildMcapAutoLayout,
  collectPlaybackDeviceCapabilities,
} from "./playback-layout";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";
import { useMcapSceneInventory } from "./use-mcap-scene-inventory";

const EMPTY_MANUAL_TILE_TITLES: Record<string, string> = {};

interface McapReadyInventory {
  readonly sources: readonly SceneSource[];
  readonly topicCount: number;
  readonly topics: readonly StreamInventory[];
}

type McapPosterImage = Extract<
  NonNullable<ReturnType<typeof getMcapSourceBootstrap>>["poster"],
  { kind: "image" }
>;

export interface McapSourcePlaybackProps {
  readonly cameraPreferenceField?: string;
  readonly children?: React.ReactNode;
  readonly client: McapResourceClient;
  /** Track ids to start pinned to the timeline (e.g. from a grid tag filter). */
  readonly defaultPinnedTrackIds?: readonly string[];
  readonly fileName: string;
  readonly headerActions?: React.ReactNode;
  readonly layoutScopeKey?: string;
  /** Host selected a new sample whose media descriptor is still resolving. */
  readonly navigationPending?: boolean;
  readonly onTagCreate?: TemporalTagTimelineProps["onTagCreate"];
  readonly onTagUpdate?: TemporalTagTimelineProps["onTagUpdate"];
  readonly onTagDelete?: NonNullable<
    TemporalTagTimelineProps["eventMenuItems"]
  >[number]["onSelect"];
  readonly source: ByteSourceDescriptor | null;
  readonly tracks?: readonly Track[];
}

/**
 * Source-oriented MCAP playback host. Sample renderers and ad hoc panels both
 * feed it a byte source; it owns inventory loading, MCAP providers, tiling,
 * layout persistence, and the playback chrome around the discovered streams.
 */
export const McapSourcePlayback: React.FC<McapSourcePlaybackProps> = ({
  cameraPreferenceField,
  children,
  client,
  defaultPinnedTrackIds,
  fileName,
  headerActions,
  layoutScopeKey,
  navigationPending = false,
  onTagCreate,
  onTagUpdate,
  onTagDelete,
  source,
  tracks,
}) => {
  // Ownership must precede the children's first reads, and child effects run
  // before parent effects. The call is idempotent per source.
  if (source) {
    client.activateSource?.(source);
  }

  const imageAspectRatiosRef = useRef<Record<string, number>>({});
  const onImageAspectRatioChange = useCallback(
    (tileId: string, aspectRatio: number | null) => {
      if (aspectRatio === null) {
        delete imageAspectRatiosRef.current[tileId];
      } else {
        imageAspectRatiosRef.current[tileId] = aspectRatio;
      }
    },
    [],
  );
  const autoLayoutStrategy = useCallback(
    (tileIds: readonly string[], metrics?: TilingLayoutMetrics) => {
      const layoutGeometry = metrics ?? currentViewportAspectRatio();
      return buildMcapAutoLayout(
        tileIds,
        imageAspectRatiosRef.current,
        layoutGeometry,
      );
    },
    [],
  );
  // This layout effect records the renderer mount before the browser paints.
  useLayoutEffect(() => {
    markModalLoadingLatencyEvent("mcap renderer mounted", {
      fileName,
      readProfile: source?.readProfile,
      sourceId: source?.sourceId,
    });
  }, [fileName, source]);

  // This effect clears host-owned GPU state on unmount. The lightweight 3D
  // view snapshot intentionally outlives this host in its scoped registry.
  useEffect(() => {
    return () => {
      releaseGpuPointCloudColormapTextures();
      releaseGpuPointCloudProjectionResources();
      releaseRetainedImageTextures();
    };
  }, []);

  const { status, error, sources, topics, topicCount } = useMcapSceneInventory({
    client,
    source,
  });
  const sourceKey = useMemo(
    () => (source ? byteSourceAccessKey(source) : ""),
    [source],
  );
  const previousSourceKeyRef = useRef(sourceKey);
  const hasNavigatedRef = useRef(false);
  if (navigationPending || previousSourceKeyRef.current !== sourceKey) {
    previousSourceKeyRef.current = sourceKey;
    hasNavigatedRef.current = true;
  }
  const isModalNavigation = hasNavigatedRef.current;
  const bootstrap = useMemo(
    () => (source ? getMcapSourceBootstrap(source) : null),
    [source],
  );
  const poster: McapPosterImage | undefined =
    bootstrap?.poster?.kind === "image" ? bootstrap.poster : undefined;
  const [presentedSourceKey, setPresentedSourceKey] = useState("");
  const handlePlayheadDataReady = useCallback(
    () => setPresentedSourceKey(sourceKey),
    [sourceKey],
  );
  const readyInventory = useMemo<McapReadyInventory | null>(
    () =>
      status === "ready" && sources.length > 0
        ? { sources, topicCount, topics }
        : null,
    [sources, status, topicCount, topics],
  );
  const retainedInventoryRef = useRef<McapReadyInventory | null>(null);
  // This layout effect retains the last inventory that produced a usable shell.
  useLayoutEffect(() => {
    if (readyInventory) {
      retainedInventoryRef.current = readyInventory;
    }
  }, [readyInventory]);
  const shellInventory = readyInventory ?? retainedInventoryRef.current;
  const shellSources = shellInventory?.sources ?? sources;
  const shellTopics = shellInventory?.topics ?? topics;
  const playbackSource = readyInventory && !navigationPending ? source : null;
  const effectiveLayoutScopeKey =
    layoutScopeKey ?? (source ? `mcap-source:${source.sourceId}` : undefined);
  const cameraViewStateScopeKey =
    mcapCameraScopeKey(effectiveLayoutScopeKey, cameraPreferenceField) ??
    effectiveLayoutScopeKey;
  const metadata = useMemo(
    () => ({
      sizeLabel: sourceSizeLabel(source?.sizeBytes),
      ...sourceCounts(sources),
      topicCount,
    }),
    [source?.sizeBytes, sources, topicCount],
  );
  const headerCaption = useMemo(
    () =>
      metadata.sizeLabel ? (
        <McapHeaderCaption sizeLabel={metadata.sizeLabel} />
      ) : null,
    [metadata.sizeLabel],
  );
  const {
    initialTiles,
    initialManualTileTitles,
    initialLayout,
    initialExpandedTileId,
    resetTiles,
    defaultLeftOpen,
    onLeftOpenChange,
    defaultLeftSidebarWidth,
    onLeftSidebarWidthChange,
    sceneUpAxis,
    onSceneUpAxisChange,
    preferredWorldFrameId,
    onPreferredWorldFrameIdChange,
    preferredCameraTargetFrameId,
    onPreferredCameraTargetFrameIdChange,
    defaultTrackingMode,
    onDefaultTrackingModeChange,
  } = useMcapModalLayout({
    cameraPreferenceField,
    datasetId: effectiveLayoutScopeKey,
    readProfile: source?.readProfile,
    sources: shellSources,
  });

  // Mark scene-inventory latency once the target inventory resolves.
  useEffect(() => {
    if (status !== "ready") return;
    markModalLoadingLatencyEvent(
      "mcap scene inventory ready",
      {
        ...metadata,
        sourceCount: sources.length,
      },
      { onceKey: "mcap-scene-inventory-ready" },
    );
  }, [metadata, sources.length, status]);

  if (!source) {
    return <McapPlaybackState text="No MCAP source selected" />;
  }
  if (status === "error" && !shellInventory) {
    return (
      <McapPlaybackState
        error
        text={`Failed to read recording: ${error ?? "Unknown error"}`}
      />
    );
  }
  if (status !== "ready" && !shellInventory) {
    return (
      <McapPreparingPlayback
        fileName={fileName}
        poster={poster}
        posterTopic={bootstrap?.posterTopic}
      />
    );
  }
  if (sources.length === 0 && !shellInventory) {
    return (
      <McapPlaybackState
        text={`No previewable streams in this recording (${topicCount.toLocaleString()} topics found)`}
      />
    );
  }

  const transitionMessage =
    status === "error"
      ? `Failed to read recording: ${error ?? "Unknown error"}`
      : status === "ready" && sources.length === 0
        ? `No previewable streams in this recording (${topicCount.toLocaleString()} topics found)`
        : "Preparing viewer";
  const hasTerminalTransition =
    status === "error" || (status === "ready" && sources.length === 0);
  const transitioning =
    navigationPending ||
    readyInventory === null ||
    presentedSourceKey !== sourceKey;

  return (
    <div
      className={styles.playbackRoot}
      data-mcap-playback-shell=""
      data-mcap-source-transitioning={transitioning || undefined}
    >
      <McapPlaybackSessionStateProviders
        cameraViewStateScopeKey={cameraViewStateScopeKey}
        viewportScopeKey={effectiveLayoutScopeKey}
      >
        <McapFrameTransformsProvider>
          <McapPoseTrajectoriesProvider>
            <McapLocationTracksProvider>
              <McapSceneUpdateHistoryProvider>
                <McapNumericSeriesProvider>
                  <McapRawMessageProvider>
                    <McapLogConsoleProvider
                      client={client}
                      source={playbackSource}
                    >
                      <McapDataStreamProvider
                        expectedSourceKey={playbackSource ? sourceKey : null}
                      >
                        <McapProjectionResourceBoundary />
                        <Mcap3dViewSettingsProvider
                          defaultTrackingMode={defaultTrackingMode}
                          preferredCameraTargetFrameId={
                            preferredCameraTargetFrameId
                          }
                          preferredWorldFrameId={preferredWorldFrameId}
                          sceneUpAxis={sceneUpAxis}
                          setDefaultTrackingMode={onDefaultTrackingModeChange}
                          setPreferredCameraTargetFrameId={
                            onPreferredCameraTargetFrameIdChange
                          }
                          setPreferredWorldFrameId={
                            onPreferredWorldFrameIdChange
                          }
                          setSceneUpAxis={onSceneUpAxisChange}
                        >
                          <McapImageAspectRatioProvider
                            onChange={onImageAspectRatioChange}
                          >
                            <MultiModalPlayback
                              fileName={fileName}
                              headerCaption={headerCaption}
                              headerActions={
                                <McapHeaderActions actions={headerActions} />
                              }
                              addTileMenu={<McapAddTileMenu />}
                              timelineExtraActions={<McapTimestampReadout />}
                              sceneSources={shellSources}
                              deselectFocusedTileOnRepeatSelect={false}
                              initialTiles={initialTiles}
                              initialManualTileTitles={initialManualTileTitles}
                              autoLayoutStrategy={autoLayoutStrategy}
                              initialLayout={initialLayout}
                              initialExpandedTileId={initialExpandedTileId}
                              resetTiles={resetTiles}
                              resetManualTileTitles={EMPTY_MANUAL_TILE_TITLES}
                              resetLayoutStrategy={autoLayoutStrategy}
                              tracks={
                                tracks && tracks.length > 0
                                  ? [...tracks]
                                  : undefined
                              }
                              defaultPinnedTrackIds={
                                defaultPinnedTrackIds &&
                                defaultPinnedTrackIds.length > 0
                                  ? [...defaultPinnedTrackIds]
                                  : undefined
                              }
                              onTagDelete={onTagDelete}
                              leftSidebar={
                                <McapSettingsSidebar topics={shellTopics} />
                              }
                              mainOverlay={
                                hasTerminalTransition ? (
                                  <McapPlaybackState
                                    error={status === "error"}
                                    text={transitionMessage}
                                  />
                                ) : !isModalNavigation &&
                                  presentedSourceKey !== sourceKey ? (
                                  <McapPosterOverlay
                                    fileName={fileName}
                                    poster={poster}
                                    posterTopic={bootstrap?.posterTopic}
                                    statusText={transitionMessage}
                                  />
                                ) : null
                              }
                              rightSidebar={<McapInspectorSidebar />}
                              sharedImageWebGpuViews
                              defaultRightOpen={false}
                              defaultLeftOpen={defaultLeftOpen}
                              onLeftOpenChange={onLeftOpenChange}
                              leftSidebarWidth={defaultLeftSidebarWidth}
                              onLeftSidebarWidthChange={
                                onLeftSidebarWidthChange
                              }
                              onTagCreate={onTagCreate}
                              onTagUpdate={onTagUpdate}
                            >
                              <McapStreams
                                client={client}
                                onPlayheadDataReady={handlePlayheadDataReady}
                                source={playbackSource}
                              />
                              <McapNetworkHealthTracker client={client} />
                              <McapPausedByteBanking
                                client={client}
                                source={playbackSource}
                              />
                              <McapSelectionHotkeys />
                              {children}
                              <McapModalLayoutPersistence
                                datasetId={effectiveLayoutScopeKey}
                              />
                            </MultiModalPlayback>
                          </McapImageAspectRatioProvider>
                        </Mcap3dViewSettingsProvider>
                      </McapDataStreamProvider>
                    </McapLogConsoleProvider>
                  </McapRawMessageProvider>
                </McapNumericSeriesProvider>
              </McapSceneUpdateHistoryProvider>
            </McapLocationTracksProvider>
          </McapPoseTrajectoriesProvider>
        </McapFrameTransformsProvider>
      </McapPlaybackSessionStateProviders>
    </div>
  );
};

/** State shared within the current dataset/media-field inspection session. */
const McapPlaybackSessionStateProviders: React.FC<{
  readonly cameraViewStateScopeKey?: string;
  readonly children: React.ReactNode;
  readonly viewportScopeKey?: string;
}> = ({ cameraViewStateScopeKey, children, viewportScopeKey }) => (
  <Mcap3dViewStateProvider scopeKey={cameraViewStateScopeKey}>
    <McapPanelVisibilityProvider scopeKey={cameraViewStateScopeKey}>
      <Mcap3dViewpointProvider>
        <McapMapViewportScopeProvider scopeKey={viewportScopeKey}>
          {children}
        </McapMapViewportScopeProvider>
      </Mcap3dViewpointProvider>
    </McapPanelVisibilityProvider>
  </Mcap3dViewStateProvider>
);

/** Retires only the previous recording's GPU buffers on an in-place swap. */
function McapProjectionResourceBoundary() {
  const sourceKey = useMcapDataStream()?.sourceKey;
  // This effect releases projection buffers when its recording boundary changes.
  useEffect(
    () => () => {
      if (sourceKey) {
        releaseGpuPointCloudProjectionResourcesForSource(sourceKey);
      }
    },
    [sourceKey],
  );
  return null;
}

function McapHeaderActions({
  actions,
}: {
  readonly actions?: React.ReactNode;
}) {
  return (
    <>
      <McapNetworkStatusPill />
      {actions}
    </>
  );
}

function McapPlaybackState({
  text,
  error = false,
  children,
}: {
  text?: string;
  error?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.state} data-testid="mcap-modal-state">
      {children}
      {text ? (
        <span className={clsx(styles.stateText, error && styles.stateError)}>
          {text}
        </span>
      ) : null}
    </div>
  );
}

function McapPreparingPlayback({
  fileName,
  poster,
  posterTopic,
}: {
  readonly fileName: string;
  readonly poster?: McapPosterImage;
  readonly posterTopic?: string;
}) {
  useMcapPosterLatencyMarks(Boolean(poster));

  return (
    <div
      aria-label={`Preparing ${fileName}`}
      className={styles.preparing}
      data-testid="mcap-preparing-scaffold"
      role="status"
    >
      <div className={styles.preparingHeader}>
        <span className={styles.preparingFileName}>{fileName}</span>
        <span className={styles.preparingStatus}>Preparing viewer</span>
      </div>
      <div className={styles.preparingTiles}>
        <McapPosterCard poster={poster} posterTopic={posterTopic} />
        <div className={styles.preparingTile} />
        <div className={styles.preparingTile} />
      </div>
      <div className={styles.preparingTimeline} />
    </div>
  );
}

function McapPosterOverlay({
  fileName,
  poster,
  posterTopic,
  statusText,
}: {
  readonly fileName: string;
  readonly poster?: McapPosterImage;
  readonly posterTopic?: string;
  readonly statusText?: string;
}) {
  useMcapPosterLatencyMarks(Boolean(poster));

  return (
    <div
      aria-label={`Preview of ${fileName}`}
      className={styles.posterOverlay}
      data-testid="mcap-poster-overlay"
    >
      <McapPosterCard
        poster={poster}
        posterTopic={posterTopic}
        statusText={statusText}
      />
    </div>
  );
}

function McapPosterCard({
  poster,
  posterTopic,
  statusText,
}: {
  readonly poster?: McapPosterImage;
  readonly posterTopic?: string;
  readonly statusText?: string;
}) {
  return (
    <div className={styles.posterCard}>
      {poster ? (
        <BitmapImageFrameView
          className={styles.posterImage}
          fit="cover"
          frame={poster.image}
        />
      ) : (
        <Spinner size={Size.Lg} />
      )}
      <div className={styles.posterCaption}>
        <span>{posterTopic ?? "Primary preview"}</span>
        <span>{statusText ?? (poster ? "Preview" : "Preparing")}</span>
      </div>
    </div>
  );
}

function useMcapPosterLatencyMarks(hasPoster: boolean): void {
  // This layout effect records scaffold and poster commit/paint boundaries.
  useLayoutEffect(() => {
    markModalLoadingLatencyEvent(
      "mcap scaffold committed",
      { hasPoster },
      {
        onceKey: "mcap-scaffold-committed",
      },
    );
    const cancelScaffoldPaint = markModalLoadingLatencyEventAfterPaint(
      "mcap scaffold painted",
      { hasPoster },
      { onceKey: "mcap-scaffold-painted" },
    );
    if (!hasPoster) {
      return cancelScaffoldPaint;
    }

    markModalLoadingLatencyEvent("mcap poster committed", undefined, {
      onceKey: "mcap-poster-committed",
    });
    const cancelPosterPaint = markModalLoadingLatencyEventAfterPaint(
      "mcap poster painted",
      undefined,
      { onceKey: "mcap-poster-painted" },
    );
    return () => {
      cancelScaffoldPaint();
      cancelPosterPaint();
    };
  }, [hasPoster]);
}

// Deliberately just the file size: topic/stream/label counts used to render
// here too, but they ate header real estate without informing any decision.
function McapHeaderCaption({ sizeLabel }: { readonly sizeLabel: string }) {
  return <span className={styles.captionText}>{sizeLabel}</span>;
}

function sourceCounts(sources: readonly { type: string }[]) {
  return {
    imageCount: sources.filter((s) => s.type === MCAP_SOURCE_TYPE.IMAGE).length,
    labelCount: sources.filter(
      (s) =>
        s.type === MCAP_SOURCE_TYPE.IMAGE_ANNOTATION ||
        s.type === MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
    ).length,
    pointCloudCount: sources.filter(
      (s) => s.type === MCAP_SOURCE_TYPE.POINT_CLOUD,
    ).length,
  };
}

function currentViewportAspectRatio(): number {
  const { viewportHeight, viewportWidth } = collectPlaybackDeviceCapabilities();
  return viewportWidth / viewportHeight;
}

function sourceSizeLabel(sizeBytes: string | undefined): string | null {
  if (!sizeBytes || !/^\d+$/.test(sizeBytes)) return null;
  const value = Number(sizeBytes);
  if (!Number.isSafeInteger(value)) return null;
  if (value === 0) return "0 B";
  return humanReadableBytes(value) || null;
}
