import { usePlayhead } from "@fiftyone/playback";
import { tz } from "@date-fns/tz/tz";
import {
  SelectAnchor,
  Text,
  TextColor,
  TextVariant,
  TreeSelect,
  type TreeNode,
  type TreePath,
} from "@voxel51/voodo";
import { format } from "date-fns/format";
import React, { useState } from "react";
import { useEpisodeDataStream } from "./episode-data-stream-context";
import styles from "./EpisodeTimestampReadout.module.css";
import { useCopyFeedback } from "./use-copy-feedback";

const NS_PER_SECOND = 1_000_000_000n;
const NS_PER_MILLISECOND = 1_000_000n;
const NS_PER_TIME_ZONE_OFFSET_BUCKET = 15n * 60n * NS_PER_SECOND;

// Wall-clock plausibility window. Lower bound: 1e18 ns ≈ 2001-09-09 UTC
// — smaller start times are sim/relative clocks and get no absolute
// readout (the relative m:ss clock next to this one still covers them).
// Upper bound: 2100-01-01 — anything later is a mis-scaled or corrupt
// stamp, and showing it would be worse than showing nothing.
const EPOCH_GATE_MIN_NS = 1_000_000_000_000_000_000n;
const EPOCH_GATE_MAX_NS = 4_102_444_800_000_000_000n;

const DEFAULT_TIME_ZONE = "UTC";

const MONO_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const TIME_ZONE_TREE_CACHE = new Map<number, TimeZoneTreeRoot>();
const TIME_ZONE_TREE_CACHE_LIMIT = 8;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

interface TimeZoneTreeNode extends TreeNode {
  readonly timeZone: string;
}

interface TimeZoneTreeRoot extends TreeNode {
  readonly values: TimeZoneTreeNode[];
}

const INFERRED_TIME_ZONE = resolveInferredTimeZone();
const TIME_ZONE_OPTIONS = resolveTimeZoneOptions();
const TIME_ZONE_OPTION_SET = new Set(TIME_ZONE_OPTIONS);

/** Whether a log timestamp plausibly encodes a real wall-clock epoch. */
export function isPlausibleEpochNs(ns: bigint): boolean {
  return ns >= EPOCH_GATE_MIN_NS && ns <= EPOCH_GATE_MAX_NS;
}

/** Compact wall-clock display for the controls row: `14:03:22.123 UTC`. */
export function formatEpisodeWallClock(
  ns: bigint,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const time = formatEpisodeWallClockTime(ns, timeZone);
  return `${time} ${timeZone}`;
}

export function getEpisodeTimeZoneOptions(): readonly string[] {
  return TIME_ZONE_OPTIONS;
}

export function getEpisodeInferredTimeZone(): string {
  return INFERRED_TIME_ZONE;
}

export function searchEpisodeTimeZones(search: string): string[] {
  const normalizedSearch = normalizeTimeZoneSearch(search);
  const values = normalizedSearch
    ? TIME_ZONE_OPTIONS.filter((timeZone) =>
        normalizeTimeZoneSearch(timeZone).includes(normalizedSearch),
      )
    : TIME_ZONE_OPTIONS;

  return [...values];
}

export function formatEpisodeTimeZoneOption(
  timeZone: string,
  ns: bigint,
): string {
  return `${timeZone} (${formatEpisodeTimeZoneOffset(timeZone, ns)})`;
}

export function formatEpisodeTimeZoneOffset(
  timeZone: string,
  ns: bigint,
): string {
  return format(nsToDate(ns), "OOOO", { in: tz(timeZone) });
}

function formatEpisodeWallClockTime(ns: bigint, timeZone: string): string {
  return format(nsToDate(ns), "HH:mm:ss.SSS", { in: tz(timeZone) });
}

function resolveInferredTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone && canFormatTimeZone(timeZone)) {
      return timeZone;
    }
  } catch {
    // Fall back to UTC below.
  }

  return DEFAULT_TIME_ZONE;
}

function resolveTimeZoneOptions(): readonly string[] {
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  const supportedTimeZones =
    typeof supportedValuesOf === "function"
      ? safeSupportedTimeZones(supportedValuesOf)
      : [];
  const timeZones = [
    INFERRED_TIME_ZONE,
    DEFAULT_TIME_ZONE,
    ...[...supportedTimeZones].sort((a, b) => a.localeCompare(b)),
  ];

  return [...new Set(timeZones)];
}

function safeSupportedTimeZones(
  supportedValuesOf: IntlWithSupportedValues["supportedValuesOf"],
): readonly string[] {
  try {
    return supportedValuesOf?.call(Intl, "timeZone") ?? [];
  } catch {
    return [];
  }
}

function normalizeTimeZoneSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/+-]+/g, " ")
    .trim();
}

function canFormatTimeZone(timeZone: string): boolean {
  try {
    format(0, "HH:mm:ss", { in: tz(timeZone) });
    return true;
  } catch {
    return false;
  }
}

function nsToDate(ns: bigint): Date {
  return new Date(Number(ns / NS_PER_MILLISECOND));
}

function getTimeZoneTree(ns: bigint): TimeZoneTreeRoot {
  const bucket = Number(ns / NS_PER_TIME_ZONE_OFFSET_BUCKET);
  const cached = TIME_ZONE_TREE_CACHE.get(bucket);
  if (cached) {
    return cached;
  }

  const root = {
    name: "timezones",
    values: TIME_ZONE_OPTIONS.map((timeZone) => ({
      can_select: true,
      description: `(${formatEpisodeTimeZoneOffset(timeZone, ns)})`,
      name: timeZone,
      timeZone,
    })),
  };

  TIME_ZONE_TREE_CACHE.set(bucket, root);
  if (TIME_ZONE_TREE_CACHE.size > TIME_ZONE_TREE_CACHE_LIMIT) {
    const oldestKey = TIME_ZONE_TREE_CACHE.keys().next().value;
    TIME_ZONE_TREE_CACHE.delete(oldestKey);
  }

  return root;
}

function timeZonePathFor(
  root: TimeZoneTreeRoot,
  timeZone: string,
): TreePath | undefined {
  const node = root.values.find((value) => value.timeZone === timeZone);
  return node ? [root.name, node.name] : undefined;
}

function timeZoneFromPath(
  root: TimeZoneTreeRoot,
  path: TreePath | null,
): string | null {
  const nodeName = path?.[path.length - 1];
  if (!nodeName) {
    return null;
  }

  return root.values.find((node) => node.name === nodeName)?.timeZone ?? null;
}

export function getEpisodeTimeZonePath(
  timeZone: string,
  ns: bigint,
): TreePath | undefined {
  return timeZonePathFor(getTimeZoneTree(ns), timeZone);
}

export function getEpisodeTimeZoneFromPath(
  path: TreePath | null,
  ns: bigint,
): string | null {
  return timeZoneFromPath(getTimeZoneTree(ns), path);
}

function displayTimeZoneValue(_path: TreePath, node: TreeNode): string {
  return "timeZone" in node ? String(node.timeZone) : node.name;
}

/**
 * Full-precision copy payload: ISO-8601 with the complete nanosecond
 * fraction plus the raw ns value, so it pastes usefully into both
 * human-facing tickets and ns-native log queries.
 */
export function formatEpisodeTimestampCopyText(ns: bigint): string {
  const wholeSeconds = ns / NS_PER_SECOND;
  const fraction = String(ns % NS_PER_SECOND).padStart(9, "0");
  const iso = new Date(Number(wholeSeconds) * 1000).toISOString();
  return `${iso.replace(".000Z", `.${fraction}Z`)} (${ns} ns)`;
}

/**
 * Absolute log-time readout for the timeline controls row. Shows the
 * playhead as recording wall-clock time in the selected timezone and copies
 * the full-precision timestamp from the clock button — the value engineers
 * paste into external log queries and tickets. Renders nothing for recordings
 * whose timestamps aren't a plausible epoch (sim time).
 *
 * Mounted through `MultiModalPlayback`'s `timelineExtraActions` slot.
 */
const EpisodeTimestampReadout: React.FC = () => {
  const playheadSec = usePlayhead();
  const dataStream = useEpisodeDataStream();
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [copied, showCopied] = useCopyFeedback(false);

  const index = dataStream?.getTimelineIndex() ?? null;
  if (!index || !isPlausibleEpochNs(index.startTimeNs)) return null;

  const clampedSec = Math.min(Math.max(playheadSec, 0), index.durationSec);
  const absoluteNs = index.secToNs(clampedSec);
  const wallClockTime = formatEpisodeWallClockTime(absoluteNs, timeZone);
  const timeZoneTree = getTimeZoneTree(absoluteNs);
  const selectedTimeZonePath = timeZonePathFor(timeZoneTree, timeZone);
  const timeZonePickerClassName =
    timeZone === DEFAULT_TIME_ZONE
      ? `${styles.timeZonePicker} ${styles.timeZonePickerDefault}`
      : styles.timeZonePicker;

  const handleCopy = () => {
    void navigator.clipboard?.writeText(
      formatEpisodeTimestampCopyText(absoluteNs),
    );
    showCopied(true);
  };

  const handleTimezoneChange = (path: TreePath | null) => {
    const nextTimeZone = timeZoneFromPath(timeZoneTree, path);
    if (nextTimeZone && TIME_ZONE_OPTION_SET.has(nextTimeZone)) {
      setTimeZone(nextTimeZone);
    }
  };

  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      data-testid="episode-timestamp-readout"
      className={styles.readout}
      style={{ fontFamily: MONO_FONT }}
    >
      <button
        type="button"
        className={styles.copyButton}
        data-testid="episode-timestamp-copy"
        title="Recording log time — click to copy the full timestamp"
        aria-label="Copy log timestamp"
        onClick={handleCopy}
      >
        {copied ? "Copied" : wallClockTime}
      </button>
      <TreeSelect
        anchor={SelectAnchor.TopStart}
        className={timeZonePickerClassName}
        data-testid="episode-timezone-picker"
        displayValue={displayTimeZoneValue}
        onChange={handleTimezoneChange}
        panelMaxHeight="18rem"
        placeholder={DEFAULT_TIME_ZONE}
        root={timeZoneTree}
        value={selectedTimeZonePath}
      />
    </Text>
  );
};

export default EpisodeTimestampReadout;
