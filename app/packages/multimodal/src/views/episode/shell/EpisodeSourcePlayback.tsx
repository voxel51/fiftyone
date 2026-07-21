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
import MultiModalPlayback from "./MultiModalPlayback";
import { byteSourceAccessKey } from "../../../query/bytes/cache";
import type { ByteSourceDescriptor } from "../../../query/bytes/types";
import type { SceneSource } from "../../../scene-inventory";
import { EpisodePlaybackStoreProvider } from "../../../runtime";
import type { StreamInventory } from "../../../schemas/v1";
import { releaseRetainedImageTextures } from "../../../visualization/panels/image-texture-cache";
import {
  releaseGpuPointCloudProjectionResources,
  releaseGpuPointCloudProjectionResourcesForSource,
} from "../../../visualization/panels/gpu/gpu-point-cloud-projection-resources";
import { releaseGpuPointCloudColormapTextures } from "../../../visualization/panels/point-cloud/gpu/gpu-point-cloud-colormap-texture";
import { BitmapImageFrameView } from "../../../visualization/panels/bitmap-image-view";
import { getSourceBootstrap, sourceBootstrapKey } from "../../../runtime";
import type { EpisodeSession } from "../../../ports";
import { Episode3dViewStateProvider } from "../scene/episode-3d-view-state-context";
import { Episode3dViewSettingsProvider } from "../scene/episode-3d-view-settings-context";
import { Episode3dViewpointProvider } from "../scene/episode-3d-viewpoint-context";
import { useEpisodeModalSettingsScopeSync } from "../settings/episode-modal-settings";
import { EpisodeSceneFramesProvider } from "../scene/episode-scene-frames-context";
import { EpisodeSceneNoticesProvider } from "../scene/episode-scene-notices-context";
import { EpisodeTileSettingsProvider } from "../tiles/episode-tile-settings-context";
import { episodeCameraScopeKey } from "./episode-camera-scope";
import {
  EpisodeDataStreamProvider,
  useEpisodeDataStream,
} from "../playback/episode-data-stream-context";
import { EpisodeFrameTransformsProvider } from "../scene/episode-frame-transforms-context";
import { EpisodeImageAspectRatioProvider } from "../image/episode-image-aspect-ratios";
import { EpisodeLogConsoleProvider } from "../logs/episode-log-console-context";
import { EpisodeLocationTracksProvider } from "../map/episode-location-tracks-context";
import { EpisodeMapViewportScopeProvider } from "../map/episode-map-viewport-cache";
import { EpisodeNumericSeriesProvider } from "../plots/episode-numeric-series-context";
import { EpisodePoseTrajectoriesProvider } from "../scene/episode-pose-trajectories-context";
import { EpisodeRawMessageProvider } from "../raw/episode-raw-message-context";
import { EpisodeSceneUpdateHistoryProvider } from "../scene/episode-scene-update-history-context";
import { EpisodeSelectionHotkeys } from "../scene/episode-selected-object";
import EpisodeAddTileMenu from "../tiles/EpisodeAddTileMenu";
import EpisodeInspectorSidebar from "../scene/EpisodeInspectorSidebar";
import styles from "./EpisodeModalRenderer.module.css";
import {
  EpisodeNetworkHealthTracker,
  EpisodeNetworkStatusPill,
} from "./EpisodeNetworkStatus";
import { EpisodePausedByteBanking } from "../playback/EpisodePausedByteBanking";
import { EpisodePanelVisibilityProvider } from "../tiles/episode-panel-visibility";
import EpisodeSettingsSidebar from "../settings/EpisodeSettingsSidebar";
import { EpisodeStreams } from "./EpisodeStreams";
import EpisodeTimestampReadout from "../playback/EpisodeTimestampReadout";
import {
  buildEpisodeAutoLayout,
  collectPlaybackDeviceCapabilities,
} from "../layout/playback-layout";
import {
  EpisodeModalLayoutPersistence,
  useEpisodeModalLayout,
} from "../layout/use-episode-modal-layout";
import { useEpisodeSceneInventory } from "../inventory/use-episode-scene-inventory";

const EMPTY_MANUAL_TILE_TITLES: Record<string, string> = {};

interface EpisodeReadyInventory {
  readonly sources: readonly SceneSource[];
  readonly streamCount: number;
  readonly streams: readonly StreamInventory[];
}

type EpisodePosterImage = Extract<
  NonNullable<ReturnType<typeof getSourceBootstrap>>["poster"],
  { kind: "image" }
>;

/** Inputs for the source-oriented episode playback host. */
export interface EpisodeSourcePlaybackProps {
  readonly cameraPreferenceField?: string;
  readonly children?: React.ReactNode;
  readonly session: EpisodeSession | null;
  readonly sessionError?: string | null;
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
 * Source-oriented episode playback host. Sample renderers and ad hoc panels both
 * feed it a byte source; it owns inventory loading, episode providers, tiling,
 * layout persistence, and the playback chrome around the discovered streams.
 */
export const EpisodeSourcePlayback: React.FC<EpisodeSourcePlaybackProps> = ({
  cameraPreferenceField,
  children,
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
  session,
  sessionError = null,
  source,
  tracks,
}) => {
  // Ownership must precede the children's first reads, and child effects run
  // before parent effects. The call is idempotent per source.
  if (source) {
    session?.activate?.();
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
      return buildEpisodeAutoLayout(
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

  const { status, error, sources, streams, streamCount } =
    useEpisodeSceneInventory({
      error: sessionError,
      session,
      sourceAvailable: source !== null,
    });
  const sourceKey = useMemo(
    () => (source ? sourceBootstrapKey(source) : ""),
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
    () => (source ? getSourceBootstrap(source) : null),
    [source],
  );
  const poster: EpisodePosterImage | undefined =
    bootstrap?.poster?.kind === "image" ? bootstrap.poster : undefined;
  const [presentedSourceKey, setPresentedSourceKey] = useState("");
  const handlePlayheadDataReady = useCallback(
    () => setPresentedSourceKey(sourceKey),
    [sourceKey],
  );
  const readyInventory = useMemo<EpisodeReadyInventory | null>(
    () =>
      status === "ready" && sources.length > 0
        ? { sources, streamCount, streams }
        : null,
    [sources, status, streamCount, streams],
  );
  const retainedInventoryRef = useRef<EpisodeReadyInventory | null>(null);
  // This layout effect retains the last inventory that produced a usable shell.
  useLayoutEffect(() => {
    if (readyInventory) {
      retainedInventoryRef.current = readyInventory;
    }
  }, [readyInventory]);
  const shellInventory = readyInventory ?? retainedInventoryRef.current;
  const shellSources = shellInventory?.sources ?? sources;
  const shellStreams = shellInventory?.streams ?? streams;
  const playbackSource = readyInventory && !navigationPending ? source : null;
  const effectiveLayoutScopeKey =
    layoutScopeKey ??
    (source ? `episode-source:${source.sourceId}` : undefined);
  // Stream-keyed styling (point-cloud colors, image projection, label
  // streams) persists per dataset scope, not per bare stream name.
  useEpisodeModalSettingsScopeSync(effectiveLayoutScopeKey);
  const cameraViewStateScopeKey =
    episodeCameraScopeKey(effectiveLayoutScopeKey, cameraPreferenceField) ??
    effectiveLayoutScopeKey;
  const sizeLabel = sourceSizeLabel(source?.sizeBytes);
  const headerCaption = useMemo(
    () => (sizeLabel ? <EpisodeHeaderCaption sizeLabel={sizeLabel} /> : null),
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
  } = useEpisodeModalLayout({
    cameraPreferenceField,
    datasetId: effectiveLayoutScopeKey,
    readProfile: source?.readProfile,
    sources: shellSources,
  });

  if (!source) {
    return <EpisodePlaybackState text="No episode source selected" />;
  }
  if (status === "error" && !shellInventory) {
    return (
      <EpisodePlaybackState
        error
        text={`Failed to read recording: ${error ?? "Unknown error"}`}
      />
    );
  }
  if (status !== "ready" && !shellInventory) {
    return (
      <EpisodePreparingPlayback
        fileName={fileName}
        poster={poster}
        posterStream={bootstrap?.posterStreamId}
      />
    );
  }
  if (sources.length === 0 && !shellInventory) {
    return (
      <EpisodePlaybackState
        text={`No previewable streams in this recording (${streamCount.toLocaleString()} streams found)`}
      />
    );
  }

  const transitionMessage =
    status === "error"
      ? `Failed to read recording: ${error ?? "Unknown error"}`
      : status === "ready" && sources.length === 0
        ? `No previewable streams in this recording (${streamCount.toLocaleString()} streams found)`
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
      data-episode-playback-shell=""
      data-episode-source-transitioning={transitioning || undefined}
    >
      <EpisodePlaybackSessionStateProviders
        cameraViewStateScopeKey={cameraViewStateScopeKey}
        viewportScopeKey={effectiveLayoutScopeKey}
      >
        <EpisodeFrameTransformsProvider>
          <EpisodePoseTrajectoriesProvider>
            <EpisodeLocationTracksProvider>
              <EpisodeSceneUpdateHistoryProvider>
                <EpisodeNumericSeriesProvider>
                  <EpisodeRawMessageProvider>
                    <EpisodeLogConsoleProvider
                      session={readyInventory ? session : null}
                      sourceKey={playbackSource ? sourceAccessKey : null}
                    >
                      <EpisodeDataStreamProvider
                        expectedSourceKey={
                          playbackSource ? sourceAccessKey : null
                        }
                      >
                        <EpisodeProjectionResourceBoundary />
                        <Episode3dViewSettingsProvider
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
                          <EpisodeImageAspectRatioProvider
                            onChange={onImageAspectRatioChange}
                          >
                            <MultiModalPlayback
                              fileName={fileName}
                              decorateTrack={decorateTrack}
                              headerCaption={headerCaption}
                              headerActions={
                                <EpisodeHeaderActions actions={headerActions} />
                              }
                              addTileMenu={<EpisodeAddTileMenu />}
                              timelineExtraActions={<EpisodeTimestampReadout />}
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
                                <EpisodeSettingsSidebar
                                  streams={shellStreams}
                                />
                              }
                              mainOverlay={
                                hasTerminalTransition ? (
                                  <EpisodePlaybackState
                                    error={status === "error"}
                                    text={transitionMessage}
                                  />
                                ) : !isModalNavigation &&
                                  presentedSourceKey !== sourceKey ? (
                                  <EpisodePosterOverlay
                                    fileName={fileName}
                                    poster={poster}
                                    posterStream={bootstrap?.posterStreamId}
                                    statusText={transitionMessage}
                                  />
                                ) : null
                              }
                              rightSidebar={<EpisodeInspectorSidebar />}
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
                              <EpisodeStreams
                                onPlayheadDataReady={handlePlayheadDataReady}
                                session={readyInventory ? session : null}
                                source={playbackSource}
                              />
                              <EpisodeNetworkHealthTracker
                                playback={session?.playback ?? null}
                              />
                              <EpisodePausedByteBanking
                                playback={session?.playback ?? null}
                                source={playbackSource}
                              />
                              <EpisodeSelectionHotkeys />
                              <EpisodeExtensionRuntimeBoundary>
                                {children}
                              </EpisodeExtensionRuntimeBoundary>
                              <EpisodeModalLayoutPersistence
                                datasetId={effectiveLayoutScopeKey}
                              />
                            </MultiModalPlayback>
                          </EpisodeImageAspectRatioProvider>
                        </Episode3dViewSettingsProvider>
                      </EpisodeDataStreamProvider>
                    </EpisodeLogConsoleProvider>
                  </EpisodeRawMessageProvider>
                </EpisodeNumericSeriesProvider>
              </EpisodeSceneUpdateHistoryProvider>
            </EpisodeLocationTracksProvider>
          </EpisodePoseTrajectoriesProvider>
        </EpisodeFrameTransformsProvider>
      </EpisodePlaybackSessionStateProviders>
    </div>
  );
};

/** State shared within the current dataset/media-field inspection session. */
const EpisodePlaybackSessionStateProviders: React.FC<{
  readonly cameraViewStateScopeKey?: string;
  readonly children: React.ReactNode;
  readonly viewportScopeKey?: string;
}> = ({ cameraViewStateScopeKey, children, viewportScopeKey }) => (
  <Episode3dViewStateProvider scopeKey={cameraViewStateScopeKey}>
    <EpisodePanelVisibilityProvider scopeKey={cameraViewStateScopeKey}>
      <Episode3dViewpointProvider>
        <EpisodeSceneFramesProvider>
          <EpisodeSceneNoticesProvider>
            <EpisodeTileSettingsProvider>
              <EpisodeMapViewportScopeProvider scopeKey={viewportScopeKey}>
                {children}
              </EpisodeMapViewportScopeProvider>
            </EpisodeTileSettingsProvider>
          </EpisodeSceneNoticesProvider>
        </EpisodeSceneFramesProvider>
      </Episode3dViewpointProvider>
    </EpisodePanelVisibilityProvider>
  </Episode3dViewStateProvider>
);

function EpisodeExtensionRuntimeBoundary({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const store = usePlaybackStore();
  return (
    <EpisodePlaybackStoreProvider store={store}>
      {children}
    </EpisodePlaybackStoreProvider>
  );
}

/** Retires only the previous recording's GPU buffers on an in-place swap. */
function EpisodeProjectionResourceBoundary() {
  const sourceKey = useEpisodeDataStream()?.sourceKey;
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

function EpisodeHeaderActions({
  actions,
}: {
  readonly actions?: React.ReactNode;
}) {
  return (
    <>
      <EpisodeNetworkStatusPill />
      {actions}
    </>
  );
}

function EpisodePlaybackState({
  text,
  error = false,
  children,
}: {
  text?: string;
  error?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.state} data-testid="episode-modal-state">
      {children}
      {text ? (
        <span className={clsx(styles.stateText, error && styles.stateError)}>
          {text}
        </span>
      ) : null}
    </div>
  );
}

function EpisodePreparingPlayback({
  fileName,
  poster,
  posterStream,
}: {
  readonly fileName: string;
  readonly poster?: EpisodePosterImage;
  readonly posterStream?: string;
}) {
  return (
    <div
      aria-label={`Preparing ${fileName}`}
      className={styles.preparing}
      data-testid="episode-preparing-scaffold"
      role="status"
    >
      <div className={styles.preparingHeader}>
        <span className={styles.preparingFileName}>{fileName}</span>
        <span className={styles.preparingStatus}>Preparing viewer</span>
      </div>
      <div className={styles.preparingTiles}>
        <EpisodePosterCard poster={poster} posterStream={posterStream} />
        <div className={styles.preparingTile} />
        <div className={styles.preparingTile} />
      </div>
      <div className={styles.preparingTimeline} />
    </div>
  );
}

function EpisodePosterOverlay({
  fileName,
  poster,
  posterStream,
  statusText,
}: {
  readonly fileName: string;
  readonly poster?: EpisodePosterImage;
  readonly posterStream?: string;
  readonly statusText?: string;
}) {
  return (
    <div
      aria-label={`Preview of ${fileName}`}
      className={styles.posterOverlay}
      data-testid="episode-poster-overlay"
    >
      <EpisodePosterCard
        poster={poster}
        posterStream={posterStream}
        statusText={statusText}
      />
    </div>
  );
}

function EpisodePosterCard({
  poster,
  posterStream,
  statusText,
}: {
  readonly poster?: EpisodePosterImage;
  readonly posterStream?: string;
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
        <span>{posterStream ?? "Primary preview"}</span>
        <span>{statusText ?? (poster ? "Preview" : "Preparing")}</span>
      </div>
    </div>
  );
}

// Deliberately just the file size: stream/stream/label counts used to render
// here too, but they ate header real estate without informing any decision.
function EpisodeHeaderCaption({ sizeLabel }: { readonly sizeLabel: string }) {
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
