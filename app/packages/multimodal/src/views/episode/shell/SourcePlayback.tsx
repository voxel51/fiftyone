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
import PlaybackShell from "./PlaybackShell";
import type { ByteSourceDescriptor, StreamDescriptor } from "../../../ir";
import type { SceneSource } from "../../../scene-inventory";
import { episodeSourceAccessKey } from "../../../runtime";
import { EpisodePlaybackStoreProvider } from "../../../runtime/react";
import { releaseRetainedImageTextures } from "../../../visualization/media-2d/image-texture-cache";
import {
  releaseGpuPointCloudProjectionResources,
  releaseGpuPointCloudProjectionResourcesForSource,
} from "../../../visualization/composition/gpu-point-cloud-projection-resources";
import { releaseGpuPointCloudColormapTextures } from "../../../visualization/scene-3d/gpu/gpu-point-cloud-colormap-texture";
import { BitmapImageFrameView } from "../../../visualization/media-2d/BitmapImageView";
import { getSourceBootstrap, sourceBootstrapKey } from "../../../runtime";
import type { EpisodeSession, EpisodeTerminology } from "../../../ports";
import { Scene3dViewStateProvider } from "../scene/camera/scene-3d-view-state-context";
import { Scene3dViewSettingsProvider } from "../spatial/view-settings-context";
import { Scene3dViewpointProvider } from "../scene/camera/scene-3d-viewpoint-context";
import { useModalSettingsScopeSync } from "../settings/modal/state";
import { SceneFramesProvider } from "../spatial/frame-transforms/scene-frame-controls";
import { SceneNoticesProvider } from "../status/scene-notices-context";
import { TileSettingsProvider } from "../tiles/tile-settings-context";
import { cameraScopeKey } from "./camera-scope";
import {
  DataStreamProvider,
  useDataStream,
} from "../playback/data-stream-context";
import { FrameTransformsProvider } from "../spatial/frame-transforms/context";
import { ImageAspectRatioProvider } from "../image/image-aspect-ratios";
import { LogConsoleProvider } from "../logs/log-console-context";
import { LocationTracksProvider } from "../map/tracks/context";
import { MapViewportScopeProvider } from "../map/viewport/context";
import { NumericSeriesProvider } from "../plots/numeric-series-context";
import { PoseTrajectoriesProvider } from "../scene/entities/pose-trajectories-context";
import { RawMessageProvider } from "../raw/raw-message-context";
import { SceneUpdateHistoryProvider } from "../scene/entities/scene-update-history-context";
import { SelectionHotkeys } from "../interaction/selection/selected-object";
import AddTileMenu from "./AddTileMenu";
import { tileTypesFor, getTileDefinition } from "./tile-catalog";
import InspectorSidebar from "../scene/picking/InspectorSidebar";
import styles from "./ModalRenderer.module.css";
import { NetworkHealthTracker, NetworkStatusPill } from "./NetworkStatus";
import { PausedByteBanking } from "../playback/PausedByteBanking";
import { PanelVisibilityProvider } from "../tiles/panel-visibility";
import SettingsSidebar from "../settings/modal/SettingsSidebar";
import { Streams } from "./Streams";
import TimestampReadout from "../playback/TimestampReadout";
import {
  buildAutoLayout,
  collectPlaybackDeviceCapabilities,
} from "../layout/playback-layout";
import {
  ModalLayoutPersistence,
  useModalLayout,
} from "../layout/use-modal-layout";
import { useSceneInventory } from "../stream-discovery/use-scene-inventory";

const EMPTY_MANUAL_TILE_TITLES: Record<string, string> = {};

interface ReadyInventory {
  readonly hasNumericSeries: boolean;
  readonly hasRawRecords: boolean;
  readonly sources: readonly SceneSource[];
  readonly streamCount: number;
  readonly streams: readonly StreamDescriptor[];
  readonly terminology?: EpisodeTerminology;
}

type PosterImage = Extract<
  NonNullable<ReturnType<typeof getSourceBootstrap>>["poster"],
  { kind: "image" }
>;

/** Inputs for the source-oriented episode playback host. */
export interface SourcePlaybackProps {
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
export const SourcePlayback: React.FC<SourcePlaybackProps> = ({
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
      return buildAutoLayout(
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

  const { status, error, sources, streams, streamCount } = useSceneInventory({
    error: sessionError,
    session,
    sourceAvailable: source !== null,
  });
  const sourceKey = useMemo(
    () => (source ? sourceBootstrapKey(source) : ""),
    [source],
  );
  const sourceAccessKey = useMemo(
    () => (source ? episodeSourceAccessKey(source) : ""),
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
  const poster: PosterImage | undefined =
    bootstrap?.poster?.kind === "image" ? bootstrap.poster : undefined;
  const [presentedSourceKey, setPresentedSourceKey] = useState("");
  const handlePlayheadDataReady = useCallback(
    () => setPresentedSourceKey(sourceKey),
    [sourceKey],
  );
  const readyInventory = useMemo<ReadyInventory | null>(
    () =>
      status === "ready" && sources.length > 0
        ? {
            hasNumericSeries: session?.numericSeries !== undefined,
            hasRawRecords: session?.rawRecords !== undefined,
            sources,
            streamCount,
            streams,
            terminology: session?.terminology,
          }
        : null,
    [
      session?.numericSeries,
      session?.rawRecords,
      session?.terminology,
      sources,
      status,
      streamCount,
      streams,
    ],
  );
  const retainedInventoryRef = useRef<ReadyInventory | null>(null);
  // This layout effect retains the last inventory that produced a usable shell.
  useLayoutEffect(() => {
    if (readyInventory) {
      retainedInventoryRef.current = readyInventory;
    }
  }, [readyInventory]);
  const shellInventory = readyInventory ?? retainedInventoryRef.current;
  const shellSources = shellInventory?.sources ?? sources;
  const shellStreams = shellInventory?.streams ?? streams;
  const availableTileTypes = useMemo(
    () =>
      tileTypesFor({
        hasNumericSeries: shellInventory?.hasNumericSeries ?? false,
        hasRawRecords: shellInventory?.hasRawRecords ?? false,
        sourceTypes: shellSources.map((source) => source.type),
      }),
    [shellInventory, shellSources],
  );
  const playbackSource = readyInventory && !navigationPending ? source : null;
  const effectiveLayoutScopeKey =
    layoutScopeKey ??
    (source ? `episode-source:${source.sourceId}` : undefined);
  // Stream-keyed styling (point-cloud colors, image projection, label
  // streams) persists per dataset scope, not per bare stream name.
  useModalSettingsScopeSync(effectiveLayoutScopeKey);
  const cameraViewStateScopeKey =
    cameraScopeKey(effectiveLayoutScopeKey, cameraPreferenceField) ??
    effectiveLayoutScopeKey;
  const sizeLabel = sourceSizeLabel(source?.sizeBytes);
  const headerCaption = useMemo(
    () => (sizeLabel ? <HeaderCaption sizeLabel={sizeLabel} /> : null),
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
  } = useModalLayout({
    availableTileTypes,
    cameraPreferenceField,
    datasetId: effectiveLayoutScopeKey,
    readProfile: source?.readProfile,
    resolveTile: getTileDefinition,
    sources: shellSources,
  });

  if (!source) {
    return <PlaybackState text="No episode source selected" />;
  }
  if (status === "error" && !shellInventory) {
    return (
      <PlaybackState
        error
        text={`Failed to read recording: ${error ?? "Unknown error"}`}
      />
    );
  }
  if (status !== "ready" && !shellInventory) {
    return (
      <PreparingPlayback
        fileName={fileName}
        poster={poster}
        posterStream={bootstrap?.posterStreamId}
      />
    );
  }
  if (sources.length === 0 && !shellInventory) {
    return (
      <PlaybackState
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
      <PlaybackSessionStateProviders
        cameraViewStateScopeKey={cameraViewStateScopeKey}
        viewportScopeKey={effectiveLayoutScopeKey}
      >
        <FrameTransformsProvider>
          <PoseTrajectoriesProvider>
            <LocationTracksProvider>
              <SceneUpdateHistoryProvider>
                <NumericSeriesProvider>
                  <RawMessageProvider>
                    <LogConsoleProvider
                      session={readyInventory ? session : null}
                      sourceKey={playbackSource ? sourceAccessKey : null}
                    >
                      <DataStreamProvider
                        expectedSourceKey={
                          playbackSource ? sourceAccessKey : null
                        }
                      >
                        <ProjectionResourceBoundary />
                        <Scene3dViewSettingsProvider
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
                          <ImageAspectRatioProvider
                            onChange={onImageAspectRatioChange}
                          >
                            <PlaybackShell
                              fileName={fileName}
                              decorateTrack={decorateTrack}
                              headerCaption={headerCaption}
                              headerActions={
                                <HeaderActions actions={headerActions} />
                              }
                              addTileMenu={
                                <AddTileMenu tileTypes={availableTileTypes} />
                              }
                              timelineExtraActions={<TimestampReadout />}
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
                                <SettingsSidebar
                                  streams={shellStreams}
                                  terminology={shellInventory?.terminology}
                                />
                              }
                              mainOverlay={
                                hasTerminalTransition ? (
                                  <PlaybackState
                                    error={status === "error"}
                                    text={transitionMessage}
                                  />
                                ) : !isModalNavigation &&
                                  presentedSourceKey !== sourceKey ? (
                                  <PosterOverlay
                                    fileName={fileName}
                                    poster={poster}
                                    posterStream={bootstrap?.posterStreamId}
                                    statusText={transitionMessage}
                                  />
                                ) : null
                              }
                              rightSidebar={<InspectorSidebar />}
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
                              <Streams
                                availableTileTypes={availableTileTypes}
                                onPlayheadDataReady={handlePlayheadDataReady}
                                session={readyInventory ? session : null}
                                source={playbackSource}
                              />
                              <NetworkHealthTracker
                                playback={session?.playback ?? null}
                              />
                              <PausedByteBanking
                                playback={session?.playback ?? null}
                                source={playbackSource}
                              />
                              <SelectionHotkeys />
                              <ExtensionRuntimeBoundary>
                                {children}
                              </ExtensionRuntimeBoundary>
                              <ModalLayoutPersistence
                                datasetId={effectiveLayoutScopeKey}
                              />
                            </PlaybackShell>
                          </ImageAspectRatioProvider>
                        </Scene3dViewSettingsProvider>
                      </DataStreamProvider>
                    </LogConsoleProvider>
                  </RawMessageProvider>
                </NumericSeriesProvider>
              </SceneUpdateHistoryProvider>
            </LocationTracksProvider>
          </PoseTrajectoriesProvider>
        </FrameTransformsProvider>
      </PlaybackSessionStateProviders>
    </div>
  );
};

/** State shared within the current dataset/media-field inspection session. */
const PlaybackSessionStateProviders: React.FC<{
  readonly cameraViewStateScopeKey?: string;
  readonly children: React.ReactNode;
  readonly viewportScopeKey?: string;
}> = ({ cameraViewStateScopeKey, children, viewportScopeKey }) => (
  <Scene3dViewStateProvider scopeKey={cameraViewStateScopeKey}>
    <PanelVisibilityProvider scopeKey={cameraViewStateScopeKey}>
      <Scene3dViewpointProvider>
        <SceneFramesProvider>
          <SceneNoticesProvider>
            <TileSettingsProvider>
              <MapViewportScopeProvider scopeKey={viewportScopeKey}>
                {children}
              </MapViewportScopeProvider>
            </TileSettingsProvider>
          </SceneNoticesProvider>
        </SceneFramesProvider>
      </Scene3dViewpointProvider>
    </PanelVisibilityProvider>
  </Scene3dViewStateProvider>
);

function ExtensionRuntimeBoundary({
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
function ProjectionResourceBoundary() {
  const sourceKey = useDataStream()?.sourceKey;
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

function HeaderActions({ actions }: { readonly actions?: React.ReactNode }) {
  return (
    <>
      <NetworkStatusPill />
      {actions}
    </>
  );
}

function PlaybackState({
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

function PreparingPlayback({
  fileName,
  poster,
  posterStream,
}: {
  readonly fileName: string;
  readonly poster?: PosterImage;
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
        <PosterCard poster={poster} posterStream={posterStream} />
        <div className={styles.preparingTile} />
        <div className={styles.preparingTile} />
      </div>
      <div className={styles.preparingTimeline} />
    </div>
  );
}

function PosterOverlay({
  fileName,
  poster,
  posterStream,
  statusText,
}: {
  readonly fileName: string;
  readonly poster?: PosterImage;
  readonly posterStream?: string;
  readonly statusText?: string;
}) {
  return (
    <div
      aria-label={`Preview of ${fileName}`}
      className={styles.posterOverlay}
      data-testid="episode-poster-overlay"
    >
      <PosterCard
        poster={poster}
        posterStream={posterStream}
        statusText={statusText}
      />
    </div>
  );
}

function PosterCard({
  poster,
  posterStream,
  statusText,
}: {
  readonly poster?: PosterImage;
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
function HeaderCaption({ sizeLabel }: { readonly sizeLabel: string }) {
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
