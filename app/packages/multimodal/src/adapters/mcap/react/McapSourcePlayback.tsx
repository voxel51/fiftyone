import { humanReadableBytes } from "@fiftyone/utilities";
import type { TilingLayoutMetrics } from "@fiftyone/tiling";
import {
  usePlaybackStore,
  type TemporalTagTimelineProps,
  type Track,
} from "@fiftyone/playback";
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
import { byteSourceAccessKey } from "../../../query/bytes/cache";
import type { ByteSourceDescriptor } from "../../../query/bytes/types";
import type { SceneSource } from "../../../scene-inventory";
import { McapExtensionPlaybackStoreProvider } from "../../../extensions/mcap/playback-store";
import type { StreamInventory } from "../../../schemas/v1";
import { releaseRetainedImageTextures } from "../../../visualization/panels/image-texture-cache";
import {
  releaseGpuPointCloudProjectionResources,
  releaseGpuPointCloudProjectionResourcesForSource,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection-resources";
import { releaseGpuPointCloudColormapTextures } from "../../../visualization/panels/point-cloud/gpu/gpu-point-cloud-colormap-texture";
import { BitmapImageFrameView } from "../../../visualization/panels/bitmap-image-view";
import {
  getMcapSourceBootstrap,
  mcapSourceBootstrapKey,
} from "../source-bootstrap-cache";
import type { McapResourceClient } from "../types";
import { Mcap3dViewStateProvider } from "./mcap-3d-view-state-context";
import { Mcap3dViewSettingsProvider } from "./mcap-3d-view-settings-context";
import { Mcap3dViewpointProvider } from "./mcap-3d-viewpoint-context";
import { useMcapModalSettingsScopeSync } from "./mcap-modal-settings";
import { McapSceneFramesProvider } from "./mcap-scene-frames-context";
import { McapSceneNoticesProvider } from "./mcap-scene-notices-context";
import { McapTileSettingsProvider } from "./mcap-tile-settings-context";
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
import { resolveMcapTimelineMode } from "../timeline-mode";

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

/** Inputs for the source-oriented MCAP playback host. */
export interface McapSourcePlaybackProps {
  readonly cameraPreferenceField?: string;
  readonly children?: React.ReactNode;
  readonly client: McapResourceClient;
  /** Track ids to start pinned to the timeline (e.g. from a grid tag filter). */
  readonly defaultPinnedTrackIds?: readonly string[];
  /** Per-row timeline decoration contributed by timeline sources. */
  readonly decorateTrack?: TemporalTagTimelineProps["decorateTrack"];
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
  /** Reports timeline drawer visibility to registered runtime contributions. */
  readonly onTimelineDrawerOpenChange?: (open: boolean) => void;
  /** Optional maximum expanded track-body height. */
  readonly timelineDrawerMaxSize?: number;
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
  decorateTrack,
  fileName,
  headerActions,
  layoutScopeKey,
  navigationPending = false,
  onTagCreate,
  onTagUpdate,
  onTagDelete,
  onTimelineDrawerOpenChange,
  timelineDrawerMaxSize,
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
    () => (source ? mcapSourceBootstrapKey(source) : ""),
    [source],
  );
  const sourceAccessKey = useMemo(
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
  const timelineMode = useMemo(
    () => resolveMcapTimelineMode(shellTopics),
    [shellTopics],
  );
  // PlaybackProvider reads `mode` only at creation (see MultiModalPlayback's
  // `mode` prop doc). Keying MultiModalPlayback by every resolved mode field
  // forces a remount — and a fresh provider/store — whenever navigating to a
  // source resolves a different timeline mode, instead of silently retaining
  // the previous mode's stale presentation.
  const timelineModeKey =
    timelineMode.kind === "sequence"
      ? `sequence:${timelineMode.fps}`
      : timelineMode.kind === "absolute"
        ? `absolute:${timelineMode.epochAnchorMs}`
        : "duration";
  const playbackSource = readyInventory && !navigationPending ? source : null;
  const effectiveLayoutScopeKey =
    layoutScopeKey ?? (source ? `mcap-source:${source.sourceId}` : undefined);
  // Topic-keyed styling (point-cloud colors, image projection, label
  // topics) persists per dataset scope, not per bare topic name.
  useMcapModalSettingsScopeSync(effectiveLayoutScopeKey);
  const cameraViewStateScopeKey =
    mcapCameraScopeKey(effectiveLayoutScopeKey, cameraPreferenceField) ??
    effectiveLayoutScopeKey;
  const sizeLabel = sourceSizeLabel(source?.sizeBytes);
  const headerCaption = useMemo(
    () => (sizeLabel ? <McapHeaderCaption sizeLabel={sizeLabel} /> : null),
    [sizeLabel],
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
                        expectedSourceKey={
                          playbackSource ? sourceAccessKey : null
                        }
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
                              key={timelineModeKey}
                              fileName={fileName}
                              decorateTrack={decorateTrack}
                              headerCaption={headerCaption}
                              headerActions={
                                <McapHeaderActions actions={headerActions} />
                              }
                              addTileMenu={<McapAddTileMenu />}
                              timelineExtraActions={<McapTimestampReadout />}
                              sceneSources={shellSources}
                              mode={timelineMode}
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
                              onTimelineDrawerOpenChange={
                                onTimelineDrawerOpenChange
                              }
                              timelineDrawerMaxSize={timelineDrawerMaxSize}
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
                              <McapExtensionRuntimeBoundary>
                                {children}
                              </McapExtensionRuntimeBoundary>
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
        <McapSceneFramesProvider>
          <McapSceneNoticesProvider>
            <McapTileSettingsProvider>
              <McapMapViewportScopeProvider scopeKey={viewportScopeKey}>
                {children}
              </McapMapViewportScopeProvider>
            </McapTileSettingsProvider>
          </McapSceneNoticesProvider>
        </McapSceneFramesProvider>
      </Mcap3dViewpointProvider>
    </McapPanelVisibilityProvider>
  </Mcap3dViewStateProvider>
);

function McapExtensionRuntimeBoundary({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const store = usePlaybackStore();
  return (
    <McapExtensionPlaybackStoreProvider store={store}>
      {children}
    </McapExtensionPlaybackStoreProvider>
  );
}

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

// Deliberately just the file size: topic/stream/label counts used to render
// here too, but they ate header real estate without informing any decision.
function McapHeaderCaption({ sizeLabel }: { readonly sizeLabel: string }) {
  return <span className={styles.captionText}>{sizeLabel}</span>;
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
