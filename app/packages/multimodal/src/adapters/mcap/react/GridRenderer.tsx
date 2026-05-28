import type { SampleRendererProps } from "@fiftyone/plugins";
import type { StreamInventory } from "../../../schemas/v1";
import styles from "./GridRenderer.module.css";
import { useMcapSampleTopics } from "./use-mcap-sample-topics";

const CAMERA_SCHEMAS = new Set([
  "foxglove.CompressedImage",
  "foxglove.RawImage",
]);
const LIDAR_SCHEMAS = new Set(["foxglove.PointCloud"]);
const ANNOTATION_SCHEMAS = new Set([
  "foxglove.SceneUpdate",
  "foxglove.ImageAnnotations",
]);

/**
 * Grid renderer for MCAP-backed multimodal samples. Displays the filename
 * and a breakdown of camera / lidar / annotation stream counts derived from
 * the MCAP topic inventory.
 */
export function GridRenderer({ ctx }: SampleRendererProps) {
  const topicState = useMcapSampleTopics(ctx);
  const filename = basename(ctx.media.path);

  if (topicState.status !== "ready") {
    const message =
      topicState.status === "idle"
        ? "No MCAP source"
        : topicState.status === "error"
          ? topicState.error ?? "Error"
          : "Loading…";
    return <div className={styles.status}>{message}</div>;
  }

  const { topics } = topicState;
  const cameras = topics.filter((t) => matchesSchema(t, CAMERA_SCHEMAS));
  const lidars = topics.filter((t) => matchesSchema(t, LIDAR_SCHEMAS));
  const annotations = topics.filter((t) =>
    matchesSchema(t, ANNOTATION_SCHEMAS)
  );

  const sizeBytes =
    typeof ctx.sample.sample.metadata?.size_bytes === "number"
      ? formatBytes(ctx.sample.sample.metadata.size_bytes)
      : null;

  return (
    <div className={styles.root}>
      <div className={styles.chips}>
        {cameras.length > 0 && (
          <span
            className={`${styles.chip} ${styles.camera}`}
            title={cameras.map((t) => t.displayName).join("\n")}
          >
            📷 {cameras.length}
          </span>
        )}
        {lidars.length > 0 && (
          <span
            className={`${styles.chip} ${styles.lidar}`}
            title={lidars.map((t) => t.displayName).join("\n")}
          >
            ☁ {lidars.length}
          </span>
        )}
        {annotations.length > 0 && (
          <span
            className={`${styles.chip} ${styles.annotation}`}
            title={annotations.map((t) => t.displayName).join("\n")}
          >
            🔲 {annotations.length}
          </span>
        )}
        <span
          className={styles.chip}
          title={topics.map((t) => t.displayName).join("\n")}
        >
          {topics.length} topics
        </span>
      </div>
      <div className={styles.filename} title={ctx.media.path}>
        {filename}
      </div>
      {sizeBytes && <div className={styles.meta}>{sizeBytes}</div>}
    </div>
  );
}

function matchesSchema(
  topic: StreamInventory,
  schemas: Set<string>
): boolean {
  const schema = topic.metadata["mcap.schema_name"] ?? topic.payload?.schema;
  return schema != null && schemas.has(schema);
}

function basename(filepath: string): string {
  return filepath.split(/[/\\]/).pop() ?? filepath;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}
