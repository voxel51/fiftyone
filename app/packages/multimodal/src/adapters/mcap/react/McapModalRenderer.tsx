import type { SampleRendererProps } from "@fiftyone/plugins";
import { humanReadableBytes } from "@fiftyone/utilities";
import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { McapDataStreamProvider } from "./mcap-data-stream-context";
import { McapFrameTransformsProvider } from "./mcap-frame-transforms-context";
import { McapPoseTrajectoriesProvider } from "./mcap-pose-trajectories-context";
import {
  markMcapLatencyEvent,
  startMcapLatencyDebugSession,
} from "../mcap-latency-debug";
import { McapModalSettingsProvider } from "./mcap-modal-settings";
import {
  McapNetworkHealthTracker,
  McapNetworkStatusPill,
} from "./McapNetworkStatus";
import McapSettingsSidebar from "./McapSettingsSidebar";
import { McapStreams } from "./McapStreams";
import styles from "./McapModalRenderer.module.css";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapSceneInventory } from "./use-mcap-scene-inventory";
import { useMcapTemporalTags } from "./use-mcap-temporal-tags";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * SampleRenderer for `.mcap` files. Reads the file's topic inventory to
 * discover which sources (cameras, lidars, annotation streams) the
 * recording actually contains, then composes the playback shell, the
 * MCAP data-stream provider (so the setup hook and tile bodies share
 * one handle), and the non-visual `McapStreams` that wires the
 * scene-inventory + middleware together.
 *
 * The shell mounts once the inventory is ready: the default tile
 * arrangement and stream policies are derived from it, and both are
 * mount-time inputs to the embedded providers.
 *
 * Sidebar visibility and the tile arrangement restore from the user's
 * last session (`useMcapModalLayout`) and persist as they change
 * (`McapModalLayoutPersistence`).
 */
const McapModalRenderer: React.FC<SampleRendererProps> = ({ ctx }) => {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);
  // Ownership must precede the children's first reads, and child effects run
  // before parent effects — so activation happens during render. The call is
  // idempotent per source, which keeps re-renders and StrictMode safe.
  if (source) {
    client.activateSource?.(source);
  }
  const fileName = fileNameFromPath(ctx.media.path) ?? "recording.mcap";
  const latencySessionKey = useRef(createMcapLatencySessionKey()).current;
  useLayoutEffect(() => {
    startMcapLatencyDebugSession({
      detail: {
        fileName,
        readProfile: source?.readProfile,
        sizeBytes: source?.sizeBytes,
      },
      label: "mcap modal",
      sessionKey: latencySessionKey,
      sourceKey:
        source?.sourceId ??
        (typeof ctx.media.path === "string" ? ctx.media.path : undefined),
    });
  }, [ctx.media.path, fileName, latencySessionKey, source]);
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
    () => (
      <>
        <McapHeaderCaption
          imageCount={metadata.imageCount}
          labelCount={metadata.labelCount}
          pointCloudCount={metadata.pointCloudCount}
          sizeLabel={metadata.sizeLabel}
          topicCount={metadata.topicCount}
        />
        <McapNetworkStatusPill />
      </>
    ),
    [metadata],
  );
  const {
    initialTiles,
    initialLayout,
    defaultLeftOpen,
    defaultRightOpen,
    onLeftOpenChange,
    onRightOpenChange,
  } = useMcapModalLayout({ sources, readProfile: source?.readProfile });
  const { tracks, onTagCreate, onTagDelete } = useMcapTemporalTags(ctx);

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

  if (status === "error") {
    return (
      <McapModalState
        error
        text={`Failed to read recording: ${error ?? "Unknown error"}`}
      />
    );
  }
  if (status !== "ready") {
    return (
      <McapModalState>
        <Spinner size={Size.Lg} />
      </McapModalState>
    );
  }
  if (sources.length === 0) {
    return <McapModalState text="No previewable streams in this recording" />;
  }

  return (
    <McapModalSettingsProvider>
      <McapFrameTransformsProvider>
        <McapPoseTrajectoriesProvider>
          <McapDataStreamProvider>
            <MultiModalPlayback
              fileName={fileName}
              headerCaption={headerCaption}
              sceneSources={sources}
              deselectFocusedTileOnRepeatSelect={false}
              initialTiles={initialTiles}
              initialLayout={initialLayout}
              tracks={tracks.length > 0 ? tracks : undefined}
              onTagDelete={onTagDelete}
              leftSidebar={<McapSettingsSidebar />}
              defaultLeftOpen={defaultLeftOpen}
              defaultRightOpen={defaultRightOpen}
              onLeftOpenChange={onLeftOpenChange}
              onRightOpenChange={onRightOpenChange}
              onTagCreate={onTagCreate}
            >
              <McapStreams ctx={ctx} client={client} />
              <McapNetworkHealthTracker client={client} />
              <McapModalLayoutPersistence />
            </MultiModalPlayback>
          </McapDataStreamProvider>
        </McapPoseTrajectoriesProvider>
      </McapFrameTransformsProvider>
    </McapModalSettingsProvider>
  );
};

/** Full-area placeholder shown before the playback shell can mount. */
function McapModalState({
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

function McapHeaderCaption({
  imageCount,
  labelCount,
  pointCloudCount,
  sizeLabel,
  topicCount,
}: {
  readonly imageCount: number;
  readonly labelCount: number;
  readonly pointCloudCount: number;
  readonly sizeLabel: string | null;
  readonly topicCount: number;
}) {
  const parts = [
    sizeLabel,
    `${topicCount.toLocaleString()} ${plural(topicCount, "topic", "topics")}`,
    `${(imageCount + pointCloudCount).toLocaleString()} ${plural(
      imageCount + pointCloudCount,
      "preview stream",
      "preview streams",
    )}`,
    `${labelCount.toLocaleString()} ${plural(
      labelCount,
      "label topic",
      "label topics",
    )}`,
  ].filter(Boolean);

  return <span className={styles.captionText}>{parts.join(" / ")}</span>;
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

function fileNameFromPath(path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  return path.split(/[/\\]/).pop() || null;
}

function createMcapLatencySessionKey(): string {
  return `mcap-modal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sourceSizeLabel(sizeBytes: string | undefined): string | null {
  if (!sizeBytes || !/^\d+$/.test(sizeBytes)) return null;
  const value = Number(sizeBytes);
  if (!Number.isSafeInteger(value)) return null;
  if (value === 0) return "0 B";
  return humanReadableBytes(value) || null;
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue;
}

export default McapModalRenderer;
