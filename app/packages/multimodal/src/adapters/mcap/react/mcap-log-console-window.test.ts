import { describe, expect, it } from "vitest";
import type { McapLogConsoleRow } from "./mcap-log-console-rows";
import {
  coveredLogReadRange,
  logWindowForCenter,
  mergeBoundedLogRows,
  mergeLogReadRanges,
  missingLogReadRanges,
  pruneLogRows,
  virtualLogRowRange,
} from "./mcap-log-console-window";

describe("MCAP log console window", () => {
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

    expect(merged.rows.map((entry) => entry.timeNs)).toEqual([4n, 5n, 6n]);
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

  it("preserves the existing row array when pruning changes nothing", () => {
    const rows = [row(1), row(2)];

    expect(pruneLogRows(rows, { endTimeNs: 10n, startTimeNs: 0n })).toBe(rows);
  });

  it("calculates an overscanned fixed-height viewport", () => {
    expect(
      virtualLogRowRange({
        overscan: 2,
        rowCount: 1_000,
        rowHeightPx: 30,
        scrollTop: 300,
        viewportHeight: 90,
      }),
    ).toEqual({ endIndex: 15, offsetPx: 240, startIndex: 8 });
  });

  it("clamps a stale scroll offset after the row count shrinks", () => {
    expect(
      virtualLogRowRange({
        overscan: 2,
        rowCount: 10,
        rowHeightPx: 30,
        scrollTop: 30_000,
        viewportHeight: 90,
      }),
    ).toEqual({ endIndex: 10, offsetPx: 210, startIndex: 7 });
  });
});

function row(
  time: number,
  id = `row-${time}`,
  message = `message-${time}`,
): McapLogConsoleRow {
  return {
    details: [],
    id,
    kind: "log",
    level: "info",
    message,
    timeNs: BigInt(time),
    topic: "/diagnostics",
  };
}
