import { describe, expect, it } from "vitest";
import type { EpisodeLogConsoleRow } from "../../../visualization/logs/log-console-rows";
import {
  coveredLogReadRange,
  logWindowForCenter,
  mergeBoundedLogRows,
  mergeSelectedBoundedLogRows,
  mergeLogReadRanges,
  missingLogReadRanges,
  pruneLogRows,
} from "./log-console-window";

describe("episode log console window", () => {
  it("clamps a centered window to the beginning of the recording", () => {
    expect(logWindowForCenter(5n, 30n, 2n)).toEqual({
      endTimeNs: 7n,
      startTimeNs: 0n,
    });
  });

  it("clips and coalesces cached ranges inside the active window", () => {
    expect(
      mergeLogReadRanges(
        [
          { endTimeNs: 3n, startTimeNs: -2n },
          { endTimeNs: 8n, startTimeNs: 3n },
          { endTimeNs: 20n, startTimeNs: 12n },
        ],
        { endTimeNs: 10n, startTimeNs: 0n },
      ),
    ).toEqual([{ endTimeNs: 8n, startTimeNs: 0n }]);
  });

  it("returns only gaps not covered by cached read ranges", () => {
    expect(
      missingLogReadRanges(
        [
          { endTimeNs: 4n, startTimeNs: 2n },
          { endTimeNs: 8n, startTimeNs: 6n },
        ],
        { endTimeNs: 10n, startTimeNs: 0n },
      ),
    ).toEqual([
      { endTimeNs: 2n, startTimeNs: 0n },
      { endTimeNs: 6n, startTimeNs: 4n },
      { endTimeNs: 10n, startTimeNs: 8n },
    ]);
  });

  it("caps covered ranges at the final message when a read hits its limit", () => {
    const range = { endTimeNs: 10n, startTimeNs: 0n };
    expect(coveredLogReadRange(range, 5, 4n, 5)).toEqual({
      endTimeNs: 4n,
      startTimeNs: 0n,
    });
    expect(coveredLogReadRange(range, 4, 4n, 5)).toBe(range);
  });

  it("retains only the newest bounded rows in timeline order", () => {
    const merged = mergeBoundedLogRows(
      [row(1), row(2), row(3)],
      [row(6), row(4), row(5), row(20)],
      { endTimeNs: 10n, startTimeNs: 0n },
      3,
    );

    expect(merged.rows.map((entry) => entry.timelineTimeNs)).toEqual([
      4n,
      5n,
      6n,
    ]);
    expect(merged.truncated).toBe(true);
  });

  it("deduplicates row ids while merging", () => {
    const original = row(1, "same", "old");
    const replacement = row(1, "same", "new");

    const merged = mergeBoundedLogRows(
      [original],
      [replacement],
      { endTimeNs: 10n, startTimeNs: 0n },
      10,
    );

    expect(merged.rows).toEqual([replacement]);
    expect(merged.truncated).toBe(false);
  });

  it("filters levels before applying the visible-row limit", () => {
    const olderInfo = row(1);
    const newerDebug = { ...row(2), level: "debug" as const };

    const merged = mergeSelectedBoundedLogRows(
      [],
      [olderInfo, newerDebug],
      { endTimeNs: 10n, startTimeNs: 0n },
      1,
      new Set(["info"]),
    );

    expect(merged.rows).toEqual([olderInfo]);
    expect(merged.truncated).toBe(false);
  });

  it("preserves the existing row array when pruning changes nothing", () => {
    const rows = [row(1), row(2)];

    expect(pruneLogRows(rows, { endTimeNs: 10n, startTimeNs: 0n })).toBe(rows);
  });

  it("uses playback time for windowing and ordering despite divergent payload stamps", () => {
    const rows = [
      row(8, "eight", "eight", "warn", 0n),
      row(2, "two", "two", "error", 9_000n),
      row(5, "five", "five", "warn"),
      row(20, "outside", "outside", "error", 4n),
    ];

    const merged = mergeBoundedLogRows(
      [],
      rows,
      { endTimeNs: 10n, startTimeNs: 1n },
      10,
    );

    expect(merged.rows.map((entry) => entry.id)).toEqual([
      "two",
      "five",
      "eight",
    ]);
    expect(merged.rows.map((entry) => entry.messageTimeNs)).toEqual([
      9_000n,
      undefined,
      0n,
    ]);
  });

  it("filters before bounding so newer info cannot evict warn/error matches", () => {
    const important = [
      row(1, "warn", "warn", "warn"),
      row(2, "error", "error", "error"),
    ];
    const noisyInfo = Array.from({ length: 6 }, (_, index) =>
      row(index + 3, `info-${index}`, `info-${index}`, "info"),
    );

    const merged = mergeSelectedBoundedLogRows(
      [],
      [...important, ...noisyInfo],
      { endTimeNs: 20n, startTimeNs: 0n },
      3,
      new Set(["warn", "error"]),
    );

    expect(merged.rows.map((entry) => entry.id)).toEqual(["warn", "error"]);
    expect(merged.truncated).toBe(false);
  });
});

function row(
  time: number,
  id = `row-${time}`,
  message = `message-${time}`,
  level: EpisodeLogConsoleRow["level"] = "info",
  messageTimeNs?: bigint,
): EpisodeLogConsoleRow {
  return {
    details: [],
    id,
    kind: "log",
    level,
    message,
    messageTimeNs,
    stream: "/diagnostics",
    timelineTimeNs: BigInt(time),
  };
}
