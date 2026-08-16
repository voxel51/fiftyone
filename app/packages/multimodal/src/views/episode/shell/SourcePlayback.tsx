import { humanReadableBytes } from "@fiftyone/utilities";
import type { TilingLayoutMetrics } from "@fiftyone/tiling";
import {
  AudioControls,
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
import RegisterMcapAudioStreams from "../audio/RegisterMcapAudioStreams";
import {
  SCENE_SOURCE_TYPE,
  type ByteSourceDescriptor,
  type EpisodeRecordingFacts,
  type StreamDescriptor,
} from "../../../ir";
import type { SceneSource } from "../../../scene-inventory";
import { sceneSourcesFromStreamDescriptors } from "../../../stream-selection/scene-sources";
import { episodeSourceAccessKey } from "../../../runtime/episode-resources";
import { EpisodePlaybackStoreProvider } from "../../../runtime/react/playback-store-context";
import { useSourceBootstrap } from "../../../runtime/react/source-bootstrap";
import { createScheduledSourceReadBudgetAccount } from "../../../runtime/scheduled-read-budget-account";
import {
  sourceBootstrapKey,
  type SourceBootstrap,
} from "../../../runtime/source-bootstrap-cache";
import { releaseRetainedImageTextures } from "../../../visualization/media-2d/image-texture-cache";
import {
  releaseGpuImageAnnotationResources,
  releaseGpuImageAnnotationResourcesForSource,
} from "../../../visualization/media-2d/gpu-image-annotation-resources";
import {
  releaseGpuPointCloudProjectionResources,
  releaseGpuPointCloudProjectionResourcesForSource,
} from "../../../visualization/composition/gpu-point-cloud-projection-resources";
import { releaseGpuPointCloudColormapTextures } from "../../../visualization/scene-3d/gpu/gpu-point-cloud-colormap-texture";
import { BitmapImageFrameView } from "../../../visualization/media-2d/BitmapImageView";
import type { EpisodeSession, EpisodeTerminology } from "../../../ports";
import { Scene3dViewStateProvider } from "../scene/camera/scene-3d-view-state-context";
import { Scene3dViewSettingsProvider } from "../spatial/view-settings-context";
import { Scene3dViewpointProvider } from "../scene/camera/scene-3d-viewpoint-context";
import { SceneFramesProvider } from "../spatial/frame-transforms/scene-frame-controls";
import { SceneNoticesProvider } from "../status/scene-notices-context";
import { TileSettingsProvider } from "../tiles/tile-settings-context";
import { cameraScopeKey } from "../scope/camera-scope";
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
import RightSidebar from "./RightSidebar";
import styles from "./ModalRenderer.module.css";
import { NetworkHealthTracker, NetworkStatusPill } from "./NetworkStatus";
import { FullHistoryInterestsProvider } from "../playback/full-history-interests";
import { SourceVideoPlaybackProvider } from "../playback/video-playback-provider";
import { SidebarPreferencesProvider } from "../settings/sidebar-preferences-context";
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
import { resolveTimelineMode } from "../playback/timeline-mode";
import { useSceneInventoryState } from "../stream-discovery/use-scene-inventory";
import { TransformTopologyProvider } from "../transforms/transform-topology-context";
import {
  SourcePosterProvider,
  type SourcePosterValue,
} from "../image/source-poster-context";

const EMPTY_MANUAL_TILE_TITLES: Record<string, string> = {};
export const TRANSITION_STATUS_DELAY_MS = 200;

interface ReadyInventory {
  readonly hasNumericSeries: boolean;
  readonly hasRawRecords: boolean;
  readonly hasTransformTopology: boolean;
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly sources: readonly SceneSource[];
  readonly streamCount: number;
  readonly streams: readonly StreamDescriptor[];
  readonly terminology?: EpisodeTerminology;
}

type PosterImage = Extract<
  NonNullable<SourceBootstrap["poster"]>,
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
  /** Capture time to open the recording at, ahead of the first-data tick.
   * Set to an embeddings match so opening a matched tile lands on it. */
  readonly initialSeekTimeNs?: bigint | null;
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
  initialSeekTimeNs,
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
      releaseGpuImageAnnotationResources();
      releaseGpuPointCloudColormapTextures();
      releaseGpuPointCloudProjectionResources();
      releaseRetainedImageTextures();
    };
  }, []);

  const { status, error, sources, streams, streamCount } =
    useSceneInventoryState({
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
  const sourceReadBudgetAccount = useMemo(() => {
    const account = session?.boundedRead?.openAccount();
    return account ? createScheduledSourceReadBudgetAccount(account) : null;
  }, [session]);
  const bootstrap = useSourceBootstrap(source);
  const poster: PosterImage | undefined =
    bootstrap?.poster?.kind === "image" ? bootstrap.poster : undefined;
  const posterStreamId = bootstrap?.posterStreamId ?? null;
  const sourcePoster = useMemo<SourcePosterValue | null>(
    () =>
      poster
        ? {
            frame: poster.image,
            sourceKey: sourceAccessKey,
            streamId: posterStreamId,
          }
        : null,
    [poster, posterStreamId, sourceAccessKey],
  );
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
            hasTransformTopology: session?.transformTopology !== undefined,
            recordingFacts: session?.manifest?.recordingFacts,
            sources,
            streamCount,
            streams,
            terminology: session?.terminology,
          }
        : null,
    [
      session?.numericSeries,
      session?.rawRecords,
      session?.manifest?.recordingFacts,
      session?.transformTopology,
      session?.terminology,
      sources,
      status,
      streamCount,
      streams,
    ],
  );
  const bootstrapInventory = useMemo<ReadyInventory | null>(() => {
    const manifest = bootstrap?.manifest;
    if (!manifest) return null;
    const sources = sceneSourcesFromStreamDescriptors(manifest.streams);
    if (sources.length === 0) return null;
    return {
      hasNumericSeries: false,
      hasRawRecords: false,
      hasTransformTopology: false,
      recordingFacts: manifest.recordingFacts,
      sources,
      streamCount: manifest.streams.length,
      streams: manifest.streams,
    };
  }, [bootstrap?.manifest]);
  const [retainedInventoryState, setRetainedInventoryState] = useState<{
    readonly inventory: ReadyInventory;
    readonly sourceKey: string;
  } | null>(null);
  // Retain the current source's destination inventory before the bounded grid
  // bootstrap cache can evict it while the full session is still opening.
  useLayoutEffect(() => {
    const retainableInventory = readyInventory ?? bootstrapInventory;
    if (retainableInventory) {
      setRetainedInventoryState((current) =>
        current?.inventory === retainableInventory &&
        current.sourceKey === sourceKey
          ? current
          : { inventory: retainableInventory, sourceKey },
      );
    }
  }, [bootstrapInventory, readyInventory, sourceKey]);
  // A fully buffered grid tile already knows the destination manifest. Prefer
  // that source-authenticated inventory over the outgoing shell so modal open
  // and adjacent navigation can lay out the destination before session open.
  const retainedInventory =
    retainedInventoryState?.sourceKey === sourceKey
      ? retainedInventoryState.inventory
      : null;
  const destinationInventory =
    readyInventory ?? bootstrapInventory ?? retainedInventory;
  const [retainedShellInventory, setRetainedShellInventory] =
    useState<ReadyInventory | null>(null);
  // Keep the mounted shell's presentation topology while a destination that
  // lacks bootstrap facts opens. Playback and source-specific metadata remain
  // gated on destinationInventory below, so this cannot expose outgoing data.
  useLayoutEffect(() => {
    if (destinationInventory) {
      setRetainedShellInventory((current) =>
        current === destinationInventory ? current : destinationInventory,
      );
    }
  }, [destinationInventory]);
  const shellInventory = destinationInventory ?? retainedShellInventory;
  const shellSources = shellInventory?.sources ?? sources;
  const shellStreams = shellInventory?.streams ?? streams;
  // Audio scene sources become `Track` rows in the MAIN timeline
  // (`TrackProvider`'s `tracks`), not just entries in `useAudio()`'s
  // separate per-source roster — `TimelineWithTracks` gates its entire
  // Drawer (drag handle, chevron, trailingActions/AudioControls) on
  // `tracks.length > 0`, and audio registering only with `useAudio()`
  // never touches that count. Without a Track here, a recording whose
  // ONLY streams are audio (no detections, no temporal tags) would never
  // show ANY timeline chrome at all, no matter how correctly audio itself
  // decodes and registers.
  const audioTracks = useMemo<Track[]>(
    () =>
      shellSources
        .filter((source) => source.type === SCENE_SOURCE_TYPE.AUDIO)
        .map((source) => ({
          id: source.id,
          label: source.label,
          color: "#4a9eff",
          events: [],
        })),
    [shellSources],
  );
  const mergedTracks = useMemo<Track[]>(
    () => [...(tracks ?? []), ...audioTracks],
    [tracks, audioTracks],
  );
  // The transitioning gate clears when `onPlayheadDataReady` fires, which
  // requires a stream registered with the demand-driven buffered-read system
  // to cover the playhead. Audio sources decode through their own one-shot
  // read (`useMcapAudioStream`) and never participate, so a recording whose
  // only sources are audio has nothing that can ever satisfy that signal and
  // would stay masked forever. There is also nothing to preview in that case.
  const hasPreviewableSource = useMemo(
    () =>
      shellSources.some((source) => source.type !== SCENE_SOURCE_TYPE.AUDIO),
    [shellSources],
  );
  const resolvedTimelineMode = useMemo(
    () => resolveTimelineMode(shellStreams),
    [shellStreams],
  );
  // PlaybackProvider reads `mode` only at creation (see MultiModalPlayback's
  // `mode` prop doc). Keying MultiModalPlayback by every resolved mode field
  // forces a remount — and a fresh provider/store — whenever navigating to a
  // source resolves a different timeline mode, instead of silently retaining
  // the previous mode's stale presentation.
  const resolvedTimelineModeKey = timelineModeKey(resolvedTimelineMode);
  const initialShellTimelineModeRef = useRef<ReturnType<
    typeof resolveTimelineMode
  > | null>(null);
  if (initialShellTimelineModeRef.current === null && shellInventory) {
    initialShellTimelineModeRef.current = resolvedTimelineMode;
  }
  const [retainedAuthoritativeTimelineMode, setAuthoritativeTimelineMode] =
    useState<ReturnType<typeof resolveTimelineMode> | null>(null);
  // This layout effect records the last authoritative timeline mode. A
  // bootstrap manifest can seed the first-pixel shell but cannot describe
  // session capabilities such as plots, raw records, and transforms. After
  // authoritative inventory commits, hold its timeline key through adjacent
  // transitions. A different destination mode may remount only after its
  // capabilities are authoritative, so capability-gated tiles are not pruned.
  useLayoutEffect(() => {
    if (!readyInventory) return;
    setAuthoritativeTimelineMode((current) =>
      current && timelineModeKey(current) === resolvedTimelineModeKey
        ? current
        : resolvedTimelineMode,
    );
  }, [readyInventory, resolvedTimelineMode, resolvedTimelineModeKey]);
  const playbackTimelineMode = readyInventory
    ? resolvedTimelineMode
    : (retainedAuthoritativeTimelineMode ??
      initialShellTimelineModeRef.current ??
      resolvedTimelineMode);
  // The first authoritative inventory gets one chance to reseed capability-
  // gated tiles that a bootstrap manifest cannot describe. After that, keep
  // the shell mounted across source changes unless an authoritative timeline
  // mode proves incompatible with the current PlaybackProvider.
  const playbackShellKey = `${
    readyInventory || retainedAuthoritativeTimelineMode
      ? "authoritative"
      : "bootstrap"
  }:${timelineModeKey(playbackTimelineMode)}`;
  const availableTileTypes = useMemo(
    () =>
      tileTypesFor({
        hasNumericSeries: shellInventory?.hasNumericSeries ?? false,
        hasRawRecords: shellInventory?.hasRawRecords ?? false,
        hasTransformTopology: shellInventory?.hasTransformTopology ?? false,
        sourceTypes: shellSources.map((source) => source.type),
      }),
    [shellInventory, shellSources],
  );
  const playbackSource = readyInventory && !navigationPending ? source : null;
  const effectiveLayoutScopeKey =
    layoutScopeKey ??
    (source ? `episode-source:${source.sourceId}` : undefined);
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
    timelineSamplingRateHz,
    onTimelineSamplingRateChange,
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
        sourceKey={sourceAccessKey}
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
      : `No previewable streams in this recording (${streamCount.toLocaleString()} streams found)`;
  const hasTerminalTransition =
    status === "error" || (status === "ready" && sources.length === 0);
  const transitioning =
    navigationPending ||
    readyInventory === null ||
    // See `hasPreviewableSource`: an audio-only recording never publishes a
    // playhead-data-ready tick, so this would otherwise latch "transitioning"
    // forever.
    (hasPreviewableSource && presentedSourceKey !== sourceKey);

  return (
    <div
      className={styles.playbackRoot}
      data-episode-playback-shell=""
      data-episode-source-transitioning={transitioning || undefined}
    >
      <PlaybackSessionStateProviders
        cameraViewStateScopeKey={cameraViewStateScopeKey}
        sources={shellSources}
        sourcePoster={sourcePoster}
        transformTopologyCapability={
          readyInventory ? (session?.transformTopology ?? null) : null
        }
        transformTopologySourceKey={playbackSource ? sourceAccessKey : null}
        viewportScopeKey={effectiveLayoutScopeKey}
      >
        <FrameTransformsProvider>
          <PoseTrajectoriesProvider>
            <LocationTracksProvider>
              <SceneUpdateHistoryProvider>
                <NumericSeriesProvider>
                  <RawMessageProvider>
                    <LogConsoleProvider
                      budgetAccount={sourceReadBudgetAccount}
                      session={readyInventory ? session : null}
                      sourceKey={playbackSource ? sourceAccessKey : null}
                    >
                      <DataStreamProvider
                        expectedSourceKey={
                          playbackSource ? sourceAccessKey : null
                        }
                      >
                        <SourceVideoPlaybackProvider
                          sourceKey={playbackSource ? sourceAccessKey : null}
                        >
                          <SourceResourceBoundary />
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
                                key={playbackShellKey}
                                fileName={fileName}
                                decorateTrack={decorateTrack}
                                headerCaption={headerCaption}
                                headerActions={
                                  <HeaderActions
                                    actions={headerActions}
                                    loading={
                                      transitioning && !hasTerminalTransition
                                    }
                                  />
                                }
                                addTileMenu={
                                  <AddTileMenu tileTypes={availableTileTypes} />
                                }
                                timelineExtraActions={<TimestampReadout />}
                                timelineTrailingActions={<AudioControls />}
                                sceneSources={shellSources}
                                mode={playbackTimelineMode}
                                deselectFocusedTileOnRepeatSelect={false}
                                initialTiles={initialTiles}
                                initialManualTileTitles={
                                  initialManualTileTitles
                                }
                                autoLayoutStrategy={autoLayoutStrategy}
                                initialLayout={initialLayout}
                                initialExpandedTileId={initialExpandedTileId}
                                resetTiles={resetTiles}
                                resetManualTileTitles={EMPTY_MANUAL_TILE_TITLES}
                                resetLayoutStrategy={autoLayoutStrategy}
                                tracks={
                                  mergedTracks.length > 0
                                    ? mergedTracks
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
                                    onTimelineSamplingRateChange={
                                      onTimelineSamplingRateChange
                                    }
                                    recordingFacts={
                                      destinationInventory?.recordingFacts
                                    }
                                    streams={
                                      destinationInventory?.streams ?? []
                                    }
                                    terminology={
                                      destinationInventory?.terminology
                                    }
                                    timelineSamplingRateHz={
                                      timelineSamplingRateHz
                                    }
                                  />
                                }
                                mainOverlay={
                                  hasTerminalTransition ? (
                                    <PlaybackState
                                      error={status === "error"}
                                      text={transitionMessage}
                                    />
                                  ) : null
                                }
                                rightSidebar={<RightSidebar />}
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
                                  budgetAccount={sourceReadBudgetAccount}
                                  initialSeekTimeNs={initialSeekTimeNs}
                                  onPlayheadDataReady={handlePlayheadDataReady}
                                  session={readyInventory ? session : null}
                                  source={playbackSource}
                                  timelineSamplingRateHz={
                                    timelineSamplingRateHz
                                  }
                                />
                                <NetworkHealthTracker
                                  playback={session?.playback ?? null}
                                />
                                <RegisterMcapAudioStreams />
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
                        </SourceVideoPlaybackProvider>
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
  readonly sources: readonly SceneSource[];
  readonly sourcePoster: SourcePosterValue | null;
  readonly transformTopologyCapability: NonNullable<
    EpisodeSession["transformTopology"]
  > | null;
  readonly transformTopologySourceKey: string | null;
  readonly viewportScopeKey?: string;
}> = ({
  cameraViewStateScopeKey,
  children,
  sources,
  sourcePoster,
  transformTopologyCapability,
  transformTopologySourceKey,
  viewportScopeKey,
}) => (
  <SourcePosterProvider value={sourcePoster}>
    <FullHistoryInterestsProvider>
      <Scene3dViewStateProvider scopeKey={cameraViewStateScopeKey}>
        <SidebarPreferencesProvider
          scopeKey={cameraViewStateScopeKey}
          sources={sources}
        >
          <Scene3dViewpointProvider>
            <SceneFramesProvider>
              <SceneNoticesProvider>
                <TileSettingsProvider>
                  <MapViewportScopeProvider scopeKey={viewportScopeKey}>
                    <TransformTopologyProvider
                      capability={transformTopologyCapability}
                      sourceKey={transformTopologySourceKey}
                    >
                      {children}
                    </TransformTopologyProvider>
                  </MapViewportScopeProvider>
                </TileSettingsProvider>
              </SceneNoticesProvider>
            </SceneFramesProvider>
          </Scene3dViewpointProvider>
        </SidebarPreferencesProvider>
      </Scene3dViewStateProvider>
    </FullHistoryInterestsProvider>
  </SourcePosterProvider>
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

/** Retires only the previous recording's GPU resources on an in-place swap. */
function SourceResourceBoundary() {
  const sourceKey = useDataStream()?.sourceKey;
  // This effect releases projection buffers when its recording boundary changes.
  useEffect(
    () => () => {
      if (sourceKey) {
        releaseGpuImageAnnotationResourcesForSource(sourceKey);
        releaseGpuPointCloudProjectionResourcesForSource(sourceKey);
      }
    },
    [sourceKey],
  );
  return null;
}

function HeaderActions({
  actions,
  loading,
}: {
  readonly actions?: React.ReactNode;
  readonly loading: boolean;
}) {
  return (
    <>
      <DelayedTransitionStatus active={loading} />
      <NetworkStatusPill />
      {actions}
    </>
  );
}

function DelayedTransitionStatus({ active }: { readonly active: boolean }) {
  const [visible, setVisible] = useState(false);

  // This effect delays transition copy so fast sample swaps stay quiet.
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(
      () => setVisible(true),
      TRANSITION_STATUS_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [active]);

  return active && visible ? (
    <span
      className={styles.transitionStatus}
      data-testid="episode-transition-status"
      role="status"
    >
      Loading sample…
    </span>
  ) : null;
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
  sourceKey,
}: {
  readonly fileName: string;
  readonly poster?: PosterImage;
  readonly posterStream?: string;
  readonly sourceKey: string;
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
        <PosterCard
          poster={poster}
          posterStream={posterStream}
          sourceKey={sourceKey}
        />
        <div className={styles.preparingTile} />
        <div className={styles.preparingTile} />
      </div>
      <div className={styles.preparingTimeline} />
    </div>
  );
}

function PosterCard({
  poster,
  posterStream,
  sourceKey,
}: {
  readonly poster?: PosterImage;
  readonly posterStream?: string;
  readonly sourceKey: string;
}) {
  return (
    <div className={styles.posterCard}>
      {poster ? (
        <BitmapImageFrameView
          className={styles.posterImage}
          fit="cover"
          frame={poster.image}
          videoSessionKey={`${sourceKey}\n${posterStream ?? "preview"}`}
        />
      ) : (
        <Spinner size={Size.Lg} />
      )}
      <div className={styles.posterCaption}>
        <span>{posterStream ?? "Primary preview"}</span>
        <span>{poster ? "Preview" : "Preparing"}</span>
      </div>
    </div>
  );
}

function timelineModeKey(mode: ReturnType<typeof resolveTimelineMode>): string {
  return mode.kind === "sequence"
    ? `sequence:${mode.fps}`
    : mode.kind === "absolute"
      ? `absolute:${mode.epochAnchorMs}`
      : "duration";
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
