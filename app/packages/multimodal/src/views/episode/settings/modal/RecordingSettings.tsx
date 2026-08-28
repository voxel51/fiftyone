import { Button, Size, Variant } from "@voxel51/voodo";
import { memo, useCallback } from "react";
import type {
  EpisodeRecordingFacts,
  McapMessageIndexStatus,
} from "../../../../ir";
import { useCopyFeedback } from "../../../../visualization/panel-ui/use-copy-feedback";
import SidebarGroup from "../controls/SidebarGroup";
import styles from "./SettingsSidebar.module.css";

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];

/** Static recording facts already resolved with the active episode manifest. */
const RecordingSettings = memo(function RecordingSettings({
  facts,
}: {
  readonly facts?: EpisodeRecordingFacts;
}) {
  const [copied, showCopyFeedback] = useCopyFeedback(false);
  const copyDiagnostics = useCallback(async () => {
    if (!facts || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(facts, null, 2));
    } catch {
      return;
    }
    showCopyFeedback(true);
  }, [facts, showCopyFeedback]);

  if (!facts) return null;

  const format = facts.format.toLocaleUpperCase();
  const size = formatBytes(facts.sizeBytes);
  const duration = formatDurationNs(facts.durationNs);
  const summary = [format, size, duration].filter(Boolean).join(" · ");
  const commonRows: readonly RecordingFactRow[] = [
    ["Format", format],
    ["Size", size],
    ["Duration", duration],
    ["Start time", facts.lerobot ? null : formatTimestampNs(facts.startTimeNs)],
    ["End time", facts.lerobot ? null : formatTimestampNs(facts.endTimeNs)],
    ["Topics", formatInteger(facts.topicCount)],
    ["Channels", formatInteger(facts.channelCount)],
    ["Messages", formatIntegerString(facts.messageCount)],
    ["Schemas", formatInteger(facts.schemaCount)],
    ["Schema coverage", formatSchemaCoverage(facts)],
    ["App support", formatApplicationSupport(facts)],
  ];
  const mcapRows = facts.mcap ? mcapFactRows(facts) : [];
  const leRobotRows = facts.lerobot ? leRobotFactRows(facts) : [];

  return (
    <SidebarGroup defaultExpanded={false} summary={summary} title="Recording">
      <FactRows rows={commonRows} />
      {mcapRows.length > 0 ? (
        <SidebarGroup
          defaultExpanded={false}
          summary={mcapDetailsSummary(facts)}
          title="MCAP details"
        >
          <FactRows rows={mcapRows} />
        </SidebarGroup>
      ) : null}
      {leRobotRows.length > 0 ? (
        <SidebarGroup
          defaultExpanded={false}
          summary={leRobotDetailsSummary(facts)}
          title="LeRobot details"
        >
          <FactRows rows={leRobotRows} />
        </SidebarGroup>
      ) : null}
      <div className={styles.recordingActions}>
        <Button
          onClick={copyDiagnostics}
          size={Size.Xs}
          variant={Variant.Secondary}
        >
          {copied ? "Copied" : "Copy diagnostics"}
        </Button>
      </div>
    </SidebarGroup>
  );
});

type RecordingFactRow = readonly [label: string, value: string | null];

function FactRows({ rows }: { readonly rows: readonly RecordingFactRow[] }) {
  const visibleRows = rows.filter(
    (row): row is readonly [string, string] => row[1] !== null,
  );
  if (visibleRows.length === 0) return null;
  return (
    <div className={styles.statsRows}>
      {visibleRows.map(([label, value]) => (
        <div className={styles.statsRow} key={label}>
          <span>{label}</span>
          <span className={styles.statsValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function leRobotFactRows(
  facts: EpisodeRecordingFacts,
): readonly RecordingFactRow[] {
  const lerobot = facts.lerobot;
  if (!lerobot) return [];
  return [
    ["Codebase version", lerobot.codebaseVersion ?? null],
    ["Episode index", lerobot.episodeIndex ?? null],
    ["Robot type", lerobot.robotType ?? null],
    ["FPS", lerobot.fps === undefined ? null : formatDecimal(lerobot.fps)],
    ["Logical rows", formatInteger(lerobot.logicalRowCount)],
    ["Features", formatInteger(lerobot.featureCount)],
    ["Media features", formatInteger(lerobot.mediaFeatureCount)],
    [
      "Task labels",
      lerobot.taskLabels?.length ? lerobot.taskLabels.join(" · ") : null,
    ],
    [
      "Video codecs",
      lerobot.videoCodecs?.length ? lerobot.videoCodecs.join(", ") : null,
    ],
  ];
}

function mcapFactRows(
  facts: EpisodeRecordingFacts,
): readonly RecordingFactRow[] {
  const mcap = facts.mcap;
  if (!mcap) return [];
  return [
    ["Profile", mcap.profile === "" ? "None" : (mcap.profile ?? null)],
    ["Writer", mcap.library === "" ? "Unknown" : (mcap.library ?? null)],
    ["Chunks", formatInteger(mcap.chunkCount)],
    ["Compression", formatCompression(facts)],
    [
      "Compression ratio",
      mcap.compressionRatio === undefined
        ? null
        : `${formatDecimal(mcap.compressionRatio)}×`,
    ],
    ["Message indexes", formatIndexStatus(mcap.messageIndexStatus)],
    [
      "Median channels / chunk",
      mcap.medianChannelsPerChunk === undefined
        ? null
        : formatDecimal(mcap.medianChannelsPerChunk),
    ],
    ["Median chunk size", formatBytes(mcap.medianChunkSizeBytes)],
    ["Median chunk span", formatDurationNs(mcap.medianChunkSpanNs)],
    ["Attachments", formatAttachments(facts)],
    ["Metadata records", formatMetadataRecords(facts)],
  ];
}

function formatSchemaCoverage(facts: EpisodeRecordingFacts): string | null {
  const coverage = facts.schemaCoverage;
  if (!coverage) return null;
  return `${coverage.embeddedSchemaChannelCount.toLocaleString()} embedded · ${coverage.missingSchemaChannelCount.toLocaleString()} missing`;
}

function formatApplicationSupport(facts: EpisodeRecordingFacts): string | null {
  const support = facts.applicationSupport;
  if (!support) return null;
  return `${support.renderableStreamCount.toLocaleString()} renderable · ${support.inspectableStreamCount.toLocaleString()} inspectable · ${support.unavailableStreamCount.toLocaleString()} unavailable`;
}

function formatCompression(facts: EpisodeRecordingFacts): string | null {
  const compression = facts.mcap?.compression;
  if (!compression || compression.length === 0) return null;
  return compression
    .map(
      (entry) =>
        `${entry.codec} · ${entry.chunkCount.toLocaleString()} ${
          entry.chunkCount === 1 ? "chunk" : "chunks"
        }`,
    )
    .join("; ");
}

function formatAttachments(facts: EpisodeRecordingFacts): string | null {
  const mcap = facts.mcap;
  if (!mcap || mcap.attachmentCount === undefined) return null;
  const names = mcap.attachments?.map((attachment) => attachment.name) ?? [];
  return names.length > 0
    ? `${mcap.attachmentCount.toLocaleString()} · ${names.join(", ")}`
    : mcap.attachmentCount.toLocaleString();
}

function formatMetadataRecords(facts: EpisodeRecordingFacts): string | null {
  const mcap = facts.mcap;
  if (!mcap || mcap.metadataRecordCount === undefined) return null;
  const names = mcap.metadataRecordNames ?? [];
  return names.length > 0
    ? `${mcap.metadataRecordCount.toLocaleString()} · ${names.join(", ")}`
    : mcap.metadataRecordCount.toLocaleString();
}

function formatIndexStatus(
  status: McapMessageIndexStatus | undefined,
): string | null {
  switch (status) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    case "absent":
      return "Missing";
    case "unknown":
      return "Unknown";
    default:
      return null;
  }
}

function mcapDetailsSummary(facts: EpisodeRecordingFacts): string | undefined {
  const chunks = formatInteger(facts.mcap?.chunkCount);
  const indexes = formatIndexStatus(facts.mcap?.messageIndexStatus);
  return (
    [chunks ? `${chunks} chunks` : null, indexes ? `${indexes} indexes` : null]
      .filter(Boolean)
      .join(" · ") || undefined
  );
}

function leRobotDetailsSummary(
  facts: EpisodeRecordingFacts,
): string | undefined {
  const lerobot = facts.lerobot;
  if (!lerobot) return undefined;
  return (
    [
      lerobot.robotType ?? null,
      lerobot.logicalRowCount === undefined
        ? null
        : `${lerobot.logicalRowCount.toLocaleString()} rows`,
    ]
      .filter(Boolean)
      .join(" · ") || undefined
  );
}

function formatInteger(value: number | undefined): string | null {
  return value === undefined ? null : value.toLocaleString();
}

function formatIntegerString(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value).toLocaleString();
}

function formatDecimal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatBytes(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const bytes = BigInt(value);
  if (bytes === 0n) return "0 B";
  let unitIndex = 0;
  let unitSize = 1n;
  while (unitIndex < BYTE_UNITS.length - 1 && bytes >= unitSize * 1024n) {
    unitIndex++;
    unitSize *= 1024n;
  }
  if (unitIndex === 0) return `${bytes.toLocaleString()} B`;
  const hundredths = (bytes * 100n + unitSize / 2n) / unitSize;
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  const decimal = `${whole}.${fraction}`
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
  return `${decimal} ${BYTE_UNITS[unitIndex]}`;
}

function formatDurationNs(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const nanoseconds = BigInt(value);
  if (nanoseconds < 1_000_000n) return `${nanoseconds.toLocaleString()} ns`;
  if (nanoseconds < 1_000_000_000n) {
    return `${formatDecimal(Number(nanoseconds) / 1e6)} ms`;
  }
  const seconds = Number(nanoseconds) / 1e9;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${(seconds - minutes * 60).toFixed(1)}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatTimestampNs(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const nanoseconds = BigInt(value);
  const milliseconds = nanoseconds / 1_000_000n;
  const millisecondsNumber = Number(milliseconds);
  if (!Number.isSafeInteger(millisecondsNumber)) return `${value} ns`;
  const date = new Date(millisecondsNumber);
  if (Number.isNaN(date.getTime())) return `${value} ns`;
  const fractional = (nanoseconds % 1_000_000_000n).toString().padStart(9, "0");
  return `${date.toISOString().slice(0, 19)}.${fractional}Z`;
}

export default RecordingSettings;
