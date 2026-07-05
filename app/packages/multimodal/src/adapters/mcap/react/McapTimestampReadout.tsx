import { usePlayhead } from "@fiftyone/playback";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useEffect, useRef, useState } from "react";
import { useMcapDataStream } from "./mcap-data-stream-context";

const NS_PER_SECOND = 1_000_000_000n;
const NS_PER_MILLISECOND = 1_000_000n;

// Wall-clock plausibility window. Lower bound: 1e18 ns ≈ 2001-09-09 UTC
// — smaller start times are sim/relative clocks and get no absolute
// readout (the relative m:ss clock next to this one still covers them).
// Upper bound: 2100-01-01 — anything later is a mis-scaled or corrupt
// stamp, and showing it would be worse than showing nothing.
const EPOCH_GATE_MIN_NS = 1_000_000_000_000_000_000n;
const EPOCH_GATE_MAX_NS = 4_102_444_800_000_000_000n;

const COPY_FEEDBACK_MS = 1200;

const MONO_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Whether a log timestamp plausibly encodes a real wall-clock epoch. */
export function isPlausibleEpochNs(ns: bigint): boolean {
  return ns >= EPOCH_GATE_MIN_NS && ns <= EPOCH_GATE_MAX_NS;
}

/** Compact wall-clock display for the controls row: `14:03:22.123 UTC`. */
export function formatMcapWallClock(ns: bigint): string {
  const date = new Date(Number(ns / NS_PER_MILLISECOND));
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const millis = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${millis} UTC`;
}

/**
 * Full-precision copy payload: ISO-8601 with the complete nanosecond
 * fraction plus the raw ns value, so it pastes usefully into both
 * human-facing tickets and ns-native log queries.
 */
export function formatMcapTimestampCopyText(ns: bigint): string {
  const wholeSeconds = ns / NS_PER_SECOND;
  const fraction = String(ns % NS_PER_SECOND).padStart(9, "0");
  const iso = new Date(Number(wholeSeconds) * 1000).toISOString();
  return `${iso.replace(".000Z", `.${fraction}Z`)} (${ns} ns)`;
}

/**
 * Absolute log-time readout for the timeline controls row. Shows the
 * playhead as recording wall-clock time (UTC) and copies the
 * full-precision timestamp on click — the value engineers paste into
 * external log queries and tickets. Renders nothing for recordings
 * whose timestamps aren't a plausible epoch (sim time).
 *
 * Mounted through `MultiModalPlayback`'s `timelineExtraActions` slot.
 */
const McapTimestampReadout: React.FC = () => {
  const playheadSec = usePlayhead();
  const dataStream = useMcapDataStream();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // This effect clears a pending copy-feedback timer on unmount.
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const index = dataStream?.getTimelineIndex() ?? null;
  if (!index || !isPlausibleEpochNs(index.startTimeNs)) return null;

  const clampedSec = Math.min(Math.max(playheadSec, 0), index.durationSec);
  const absoluteNs = index.secToNs(clampedSec);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(
      formatMcapTimestampCopyText(absoluteNs),
    );
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setCopied(false),
      COPY_FEEDBACK_MS,
    );
  };

  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      role="button"
      tabIndex={0}
      data-cy="mcap-timestamp-readout"
      title="Recording log time — click to copy the full timestamp"
      aria-label="Copy log timestamp"
      onClick={handleCopy}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCopy();
        }
      }}
      style={{ cursor: "pointer", fontFamily: MONO_FONT }}
    >
      {copied ? "Copied" : formatMcapWallClock(absoluteNs)}
    </Text>
  );
};

export default McapTimestampReadout;
