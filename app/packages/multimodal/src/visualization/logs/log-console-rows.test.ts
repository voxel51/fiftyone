import { describe, expect, it } from "vitest";
import type { DecodedFrame } from "../../ir";
import { logConsoleRowsFromDecodedMessage } from "./log-console-rows";

describe("logConsoleRowsFromDecodedMessage", () => {
  it("expands decoder logRows into console rows with diagnostic grouping", () => {
    const rows = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {
          logRows: [
            {
              details: [{ key: "drop_rate", value: "0.2" }],
              hardwareId: "lidar-top",
              kind: "diagnostic",
              level: "error",
              message: "packet drops",
              name: "driver",
              status: "ERROR",
              timestampNs: 7_000_000_009n,
            },
          ],
        },
        stream: "/diagnostics",
      }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        details: [{ key: "drop_rate", value: "0.2" }],
        diagnosticId: "12:/diagnostics9:lidar-top6:driver",
        groupLabel: "lidar-top / driver",
        kind: "diagnostic",
        level: "error",
        message: "packet drops",
        messageTimeNs: 7_000_000_009n,
        status: "ERROR",
        stream: "/diagnostics",
        timelineTimeNs: 1n,
      }),
    ]);
  });

  it("keeps an absent payload stamp distinct from playback timeline time", () => {
    const rows = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {
          level: "warn",
          message: "tracking degraded",
          name: "controller",
        },
        timelineTimeNs: 5_000_000_004n,
        stream: "/rosout",
      }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        groupLabel: "controller",
        level: "warn",
        message: "tracking degraded",
        messageTimeNs: undefined,
        stream: "/rosout",
        timelineTimeNs: 5_000_000_004n,
      }),
    ]);
  });

  it("preserves zero and far-future payload stamps as display-only metadata", () => {
    const zeroStamp = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {
          logRows: [{ level: "info", message: "zero", timestampNs: 0n }],
        },
        timelineTimeNs: 10n,
        stream: "/rosout",
      }),
    )[0];
    const futureStamp = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {
          logRows: [
            { level: "warn", message: "future", timestampNs: 9_000_000n },
          ],
        },
        timelineTimeNs: 20n,
        stream: "/diagnostics",
      }),
    )[0];

    expect(zeroStamp).toMatchObject({
      messageTimeNs: 0n,
      timelineTimeNs: 10n,
    });
    expect(futureStamp).toMatchObject({
      messageTimeNs: 9_000_000n,
      timelineTimeNs: 20n,
    });
  });

  it("returns no rows when logRows is empty and no fallback message exists", () => {
    const rows = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {},
        stream: "/empty",
      }),
    );

    expect(rows).toEqual([]);
  });
});

function decodedMessage({
  attributes,
  timelineTimeNs = 1n,
  stream,
}: {
  readonly attributes: NonNullable<DecodedFrame["output"]["attributes"]>;
  readonly timelineTimeNs?: bigint;
  readonly stream: string;
}): DecodedFrame {
  return {
    output: { attributes },
    sequence: 3,
    streamId: stream,
    timestampNs: timelineTimeNs,
  };
}
