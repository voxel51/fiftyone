import { TileSettingsContent } from "@fiftyone/tiling";
import React from "react";
import { useStream } from "../../../lib/playback/use-stream";
import JsonDataSettings from "./JsonDataSettings";
import styles from "./JsonDataTile.module.css";

export interface JsonDataTileProps {
  /**
   * Object to render as JSON. When provided, takes priority over the
   * stream — useful for the standalone story to pass a fixed sample.
   */
  data?: unknown;
  /** Stream id this tile renders when `data` is not provided. */
  streamId?: string;
}

const PLACEHOLDER_DATA = {
  timestamp: 12.345,
  pose: {
    x: 4.21,
    y: -1.07,
    z: 0.83,
    yaw: 1.5708,
  },
  velocity: { linear: 2.34, angular: 0.01 },
  status: "ok",
};

/**
 * JSON tile body — syntax-colored render of an arbitrary object. Chrome
 * is provided externally (see `Tile` / `MosaicGrid`).
 */
const JsonDataTile: React.FC<JsonDataTileProps> = ({ data, streamId }) => {
  const streamValue = useStream<unknown>(streamId ?? "");
  const value =
    data !== undefined
      ? data
      : streamValue !== null
        ? streamValue
        : PLACEHOLDER_DATA;
  return (
    <div className={styles.body}>
      <TileSettingsContent>
        <JsonDataSettings />
      </TileSettingsContent>
      {formatJson(value)}
    </div>
  );
};

function formatJson(value: unknown, indent = 0): React.ReactNode {
  const pad = "  ".repeat(indent);
  if (value === null) return <span className={styles.punct}>null</span>;
  if (typeof value === "string") {
    return <span className={styles.string}>"{value}"</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className={styles.number}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <>
          <span className={styles.punct}>[</span>
          <span className={styles.punct}>]</span>
        </>
      );
    return (
      <>
        <span className={styles.punct}>[</span>
        {"\n"}
        {value.map((v, i) => (
          <React.Fragment key={i}>
            {"  ".repeat(indent + 1)}
            {formatJson(v, indent + 1)}
            {i < value.length - 1 ? <span className={styles.punct}>,</span> : null}
            {"\n"}
          </React.Fragment>
        ))}
        {pad}
        <span className={styles.punct}>]</span>
      </>
    );
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0)
      return (
        <>
          <span className={styles.punct}>{"{"}</span>
          <span className={styles.punct}>{"}"}</span>
        </>
      );
    return (
      <>
        <span className={styles.punct}>{"{"}</span>
        {"\n"}
        {entries.map(([k, v], i) => (
          <React.Fragment key={k}>
            {"  ".repeat(indent + 1)}
            <span className={styles.key}>"{k}"</span>
            <span className={styles.punct}>: </span>
            {formatJson(v, indent + 1)}
            {i < entries.length - 1 ? <span className={styles.punct}>,</span> : null}
            {"\n"}
          </React.Fragment>
        ))}
        {pad}
        <span className={styles.punct}>{"}"}</span>
      </>
    );
  }
  return <span>{String(value)}</span>;
}

export default JsonDataTile;
