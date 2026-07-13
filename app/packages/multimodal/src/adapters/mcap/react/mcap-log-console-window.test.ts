import { describe, expect, it } from "vitest";
import type { McapLogConsoleRow } from "./mcap-log-console-rows";
import {
  mergeBoundedLogRows,
  pruneLogRows,
  virtualLogRowRange,
} from "./mcap-log-console-window";

describe("MCAP log console window", () => {
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
