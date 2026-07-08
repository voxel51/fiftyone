import { humanReadableBytes } from "@fiftyone/utilities";
import type { TemporalTagTimelineProps, Track } from "@fiftyone/playback";
import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import {
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { releaseRetainedImageTextures } from "../../../visualization/panels/image-texture-cache";
import {
  markMcapLatencyEvent,
  startMcapLatencyDebugSession,
} from "../mcap-latency-debug";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import type { McapResourceClient } from "../types";
import { clearMcap3dViewState } from "./mcap-3d-view-state";
import { Mcap3dViewSettingsProvider } from "./mcap-3d-view-settings-context";
import { McapDataStreamProvider } from "./mcap-data-stream-context";
import { McapFrameTransformsProvider } from "./mcap-frame-transforms-context";
import { McapNumericSeriesProvider } from "./mcap-numeric-series-context";
import { McapPoseTrajectoriesProvider } from "./mcap-pose-trajectories-context";
import { McapRawMessageProvider } from "./mcap-raw-message-context";
import { McapSelectionHotkeys } from "./mcap-selected-object";
import McapAddTileMenu from "./McapAddTileMenu";
import McapInspectorSidebar from "./McapInspectorSidebar";
import styles from "./McapModalRenderer.module.css";
import {
  McapNetworkHealthTracker,
  McapNetworkStatusPill,
} from "./McapNetworkStatus";
import { McapPausedByteBanking } from "./McapPausedByteBanking";
import McapSettingsSidebar from "./McapSettingsSidebar";
import { McapStreams } from "./McapStreams";
import McapTimestampReadout from "./McapTimestampReadout";
import { buildMcapAutoLayout } from "./playback-layout";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";
import { useMcapSceneInventory } from "./use-mcap-scene-inventory";

export interface McapSourcePlaybackProps {
  readonly children?: React.ReactNode;
  readonly client: McapResourceClient;
  readonly fileName: string;
  readonly headerActions?: React.ReactNode;
  readonly latencyLabel?: string;
  readonly latencySourceKey?: string;
  readonly layoutScopeKey?: string;
  readonly onTagCreate?: TemporalTagTimelineProps["onTagCreate"];
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
  children,
  client,
  fileName,
  headerActions,
  latencyLabel = "mcap modal",
  latencySourceKey,
  layoutScopeKey,
  onTagCreate,
  onTagDelete,
  source,
  tracks,
}) => {
  // Ownership must precede the children's first reads, and child effects run
  // before parent effects. The call is idempotent per source.
  if (source) {
    client.activateSource?.(source);
  }

  const latencySessionKey = useRef(createMcapLatencySessionKey()).current;
  useLayoutEffect(() => {
    startMcapLatencyDebugSession({
      detail: {
        fileName,
        readProfile: source?.readProfile,
        rendererMountKey: latencySessionKey,
        sizeBytes: source?.sizeBytes,
      },
      label: latencyLabel,
      sessionKey: latencySessionKey,
      sourceKey: source?.sourceId ?? latencySourceKey,
    });
  }, [fileName, latencyLabel, latencySessionKey, latencySourceKey, source]);

  // The host can survive source swaps; clear view carry-over only at the
  // session boundary (modal/panel unmount).
  useEffect(() => {
    return () => {
      clearMcap3dViewState();
      releaseRetainedImageTextures();
    };
  }, []);

  const { status, error, sources, topicCount } = useMcapSceneInventory({
    client,
    source,
  });
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
    defaultLeftOpen,
    onLeftOpenChange,
    defaultLeftSidebarWidth,
    onLeftSidebarWidthChange,
    sceneUpAxis,
    onSceneUpAxisChange,
  } = useMcapModalLayout({
    datasetId: layoutScopeKey,
    readProfile: source?.readProfile,
    sources,
  });

  useEffect(() => {
    if (status !== "ready") return;
    markMcapLatencyEvent(
      "scene inventory ready",
      {
        ...metadata,
        sourceCount: sources.length,
      },
      { onceKey: "scene-inventory-ready" },
    );
  }, [metadata, sources.length, status]);

  if (!source) {
    return <McapPlaybackState text="No MCAP source selected" />;
  }
  if (status === "error") {
    return (
      <McapPlaybackState
        error
        text={`Failed to read recording: ${error ?? "Unknown error"}`}
      />
    );
  }
  if (status !== "ready") {
    return (
      <McapPlaybackState>
        <Spinner size={Size.Lg} />
      </McapPlaybackState>
    );
  }
  if (sources.length === 0) {
    return (
      <McapPlaybackState
        text={`No previewable streams in this recording (${topicCount.toLocaleString()} topics found)`}
      />
    );
  }

  return (
    <React.Fragment key={byteSourceAccessKey(source)}>
      <McapFrameTransformsProvider>
        <McapPoseTrajectoriesProvider>
          <McapNumericSeriesProvider>
            <McapRawMessageProvider>
              <McapDataStreamProvider>
                <Mcap3dViewSettingsProvider
                  sceneUpAxis={sceneUpAxis}
                  setSceneUpAxis={onSceneUpAxisChange}
                >
                  <MultiModalPlayback
                    fileName={fileName}
                    headerCaption={headerCaption}
                    headerActions={
                      <McapHeaderActions actions={headerActions} />
                    }
                    addTileMenu={<McapAddTileMenu />}
                    timelineExtraActions={<McapTimestampReadout />}
                    sceneSources={sources}
                    deselectFocusedTileOnRepeatSelect={false}
                    initialTiles={initialTiles}
                    initialManualTileTitles={initialManualTileTitles}
                    autoLayoutStrategy={buildMcapAutoLayout}
                    initialLayout={initialLayout}
                    initialExpandedTileId={initialExpandedTileId}
                    tracks={
                      tracks && tracks.length > 0 ? [...tracks] : undefined
                    }
                    onTagDelete={onTagDelete}
                    leftSidebar={<McapSettingsSidebar />}
                    rightSidebar={<McapInspectorSidebar />}
                    defaultRightOpen={false}
                    defaultLeftOpen={defaultLeftOpen}
                    onLeftOpenChange={onLeftOpenChange}
                    leftSidebarWidth={defaultLeftSidebarWidth}
                    onLeftSidebarWidthChange={onLeftSidebarWidthChange}
                    onTagCreate={onTagCreate}
                  >
                    <McapStreams client={client} source={source} />
                    <McapNetworkHealthTracker client={client} />
                    <McapPausedByteBanking client={client} source={source} />
                    <McapSelectionHotkeys />
                    {children}
                    <McapModalLayoutPersistence datasetId={layoutScopeKey} />
                  </MultiModalPlayback>
                </Mcap3dViewSettingsProvider>
              </McapDataStreamProvider>
            </McapRawMessageProvider>
          </McapNumericSeriesProvider>
        </McapPoseTrajectoriesProvider>
      </McapFrameTransformsProvider>
    </React.Fragment>
  );
};

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

function createMcapLatencySessionKey(): string {
  return `mcap-source-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sourceSizeLabel(sizeBytes: string | undefined): string | null {
  if (!sizeBytes || !/^\d+$/.test(sizeBytes)) return null;
  const value = Number(sizeBytes);
  if (!Number.isSafeInteger(value)) return null;
  if (value === 0) return "0 B";
  return humanReadableBytes(value) || null;
}
