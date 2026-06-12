import type { SampleRendererProps } from "@fiftyone/plugins";
import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";
import MultiModalPlayback from "../../../components/MultiModalPlayback/MultiModalPlayback";
import { McapDataStreamProvider } from "./mcap-data-stream-context";
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
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";
  const { status, error, sources } = useMcapSceneInventory({ client, source });
  const {
    initialTiles,
    initialLayout,
    defaultLeftOpen,
    defaultRightOpen,
    onLeftOpenChange,
    onRightOpenChange,
  } = useMcapModalLayout({ sources, readProfile: source?.readProfile });
  const { tracks, onTagCreate, onTagDelete } = useMcapTemporalTags(ctx);

  if (status === "error") {
    return <McapModalState error text={`Failed to read recording: ${error}`} />;
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
    <McapDataStreamProvider>
      <MultiModalPlayback
        fileName={fileName}
        sceneSources={sources}
        initialTiles={initialTiles}
        initialLayout={initialLayout}
        tracks={tracks.length > 0 ? tracks : undefined}
        onTagDelete={onTagDelete}
        defaultLeftOpen={defaultLeftOpen}
        defaultRightOpen={defaultRightOpen}
        onLeftOpenChange={onLeftOpenChange}
        onRightOpenChange={onRightOpenChange}
        onTagCreate={onTagCreate}
      >
        <McapStreams ctx={ctx} client={client} />
        <McapModalLayoutPersistence />
      </MultiModalPlayback>
    </McapDataStreamProvider>
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

export default McapModalRenderer;
