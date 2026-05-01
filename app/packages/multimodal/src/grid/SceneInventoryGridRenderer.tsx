import type { SampleRendererProps } from "@fiftyone/plugins";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  createMultimodalClient,
  DEFAULT_MULTIMODAL_QUERY_ROUTES,
} from "../client";
import type { SceneInventory, StreamInventory } from "../schemas/v1";

type LoadState =
  | { readonly status: "idle" | "loading" | "missing" }
  | { readonly status: "loaded"; readonly inventory: SceneInventory }
  | { readonly status: "error"; readonly message: string };

const multimodalClient = createMultimodalClient({
  routes: DEFAULT_MULTIMODAL_QUERY_ROUTES,
});

const TILE_STYLES: CSSProperties = {
  background: "#191919",
  color: "#f4f4f4",
  display: "flex",
  flexDirection: "column",
  fontFamily: "Inter, system-ui, sans-serif",
  gap: "8px",
  height: "100%",
  justifyContent: "space-between",
  overflow: "hidden",
  padding: "10px",
  width: "100%",
};

const HEADER_STYLES: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  minWidth: 0,
};

const EYEBROW_STYLES: CSSProperties = {
  color: "#a8a8a8",
  fontSize: "10px",
  letterSpacing: 0,
  lineHeight: "12px",
  textTransform: "uppercase",
};

const TITLE_STYLES: CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "18px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const SUBTITLE_STYLES: CSSProperties = {
  color: "#cfcfcf",
  fontSize: "11px",
  lineHeight: "14px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const STATS_STYLES: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const STAT_STYLES: CSSProperties = {
  background: "#2a2a2a",
  border: "1px solid #3a3a3a",
  borderRadius: "4px",
  color: "#f4f4f4",
  fontSize: "11px",
  lineHeight: "14px",
  padding: "3px 5px",
};

const STREAM_LIST_STYLES: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  minHeight: 0,
  overflow: "hidden",
};

const STREAM_ROW_STYLES: CSSProperties = {
  display: "grid",
  gap: "2px",
  minWidth: 0,
};

const STREAM_NAME_STYLES: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: "15px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const STREAM_DETAIL_STYLES: CSSProperties = {
  color: "#b8b8b8",
  fontSize: "10px",
  lineHeight: "13px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const MUTED_STYLES: CSSProperties = {
  color: "#b8b8b8",
  fontSize: "12px",
  lineHeight: "16px",
};

export function SceneInventoryGridRenderer({ ctx }: SampleRendererProps) {
  const datasetId = normalizeIdentifier(ctx.dataset.datasetId);
  const sampleId = useMemo(() => getSampleId(ctx.sample.sample), [
    ctx.sample.sample,
  ]);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!datasetId || !sampleId) {
      setState({ status: "missing" });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    multimodalClient.queries
      .getSceneInventory({ datasetId, sampleId })
      .then((inventory) => {
        if (active) {
          setState({ inventory, status: "loaded" });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            message:
              error instanceof Error ? error.message : "Unknown error",
            status: "error",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [datasetId, sampleId]);

  if (state.status === "loaded") {
    return <InventoryTile inventory={state.inventory} />;
  }

  const message =
    state.status === "error"
      ? "Inventory unavailable"
      : state.status === "missing"
        ? "Inventory identifiers missing"
        : "Loading inventory";

  return (
    <div style={TILE_STYLES}>
      <div style={HEADER_STYLES}>
        <div style={EYEBROW_STYLES}>Scene inventory</div>
        <div style={TITLE_STYLES}>{message}</div>
      </div>
      {state.status === "error" && (
        <div style={MUTED_STYLES}>{state.message}</div>
      )}
    </div>
  );
}

function InventoryTile({ inventory }: { readonly inventory: SceneInventory }) {
  const streamCount = inventory.streams.length;
  const timeTrackCount = inventory.timeTracks.length;
  const streams = inventory.streams.slice(0, 3);

  return (
    <div style={TILE_STYLES}>
      <div style={HEADER_STYLES}>
        <div style={EYEBROW_STYLES}>Scene inventory</div>
        <div style={TITLE_STYLES}>{inventory.sceneId || "Untitled scene"}</div>
        <div style={SUBTITLE_STYLES}>
          {inventory.sourceFormat || "unknown"} /{" "}
          {inventory.inventoryVersion || "unknown"}
        </div>
      </div>
      <div style={STATS_STYLES}>
        <span style={STAT_STYLES}>
          {streamCount} {pluralize("stream", streamCount)}
        </span>
        <span style={STAT_STYLES}>
          {timeTrackCount} {pluralize("time track", timeTrackCount)}
        </span>
      </div>
      <div style={STREAM_LIST_STYLES}>
        {streams.map((stream) => (
          <StreamRow key={stream.streamId} stream={stream} />
        ))}
      </div>
    </div>
  );
}

function StreamRow({ stream }: { readonly stream: StreamInventory }) {
  const kind = stream.metadata.kind;
  const encoding = stream.payload?.encoding;
  const details = [kind, encoding, formatRecordCount(stream.recordCount)]
    .filter((value): value is string => Boolean(value))
    .join(" / ");

  return (
    <div style={STREAM_ROW_STYLES}>
      <div style={STREAM_NAME_STYLES}>
        {stream.displayName || stream.streamId}
      </div>
      {details && <div style={STREAM_DETAIL_STYLES}>{details}</div>}
    </div>
  );
}

function getSampleId(
  sample: SampleRendererProps["ctx"]["sample"]["sample"]
): string | null {
  const sampleRecord = sample as { readonly _id?: unknown; readonly id?: unknown };

  return (
    normalizeIdentifier(sampleRecord._id) ?? normalizeIdentifier(sampleRecord.id)
  );
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return null;
}

function formatRecordCount(recordCount: string | undefined): string | null {
  return recordCount ? `${recordCount} records` : null;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
