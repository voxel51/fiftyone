import { describe, expect, it } from "vitest";
import type { DecodedFrame } from "../../../ir";
import { logConsoleRowsFromDecodedMessage } from "./episode-log-console-rows";

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
        groupLabel: "lidar-top / driver",
        kind: "diagnostic",
        level: "error",
        message: "packet drops",
        status: "ERROR",
        timeNs: 7_000_000_009n,
        stream: "/diagnostics",
      }),
    ]);
  });

  it("falls back to top-level message attributes and timeline time", () => {
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
        timeNs: 5_000_000_004n,
        stream: "/rosout",
      }),
    ]);
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
