import { describe, expect, it } from "vitest";
import type { McapDecodedMessage } from "../types";
import { logConsoleRowsFromDecodedMessage } from "./mcap-log-console-rows";

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
        topic: "/diagnostics",
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
        topic: "/diagnostics",
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
        topic: "/rosout",
      }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        groupLabel: "controller",
        level: "warn",
        message: "tracking degraded",
        timeNs: 5_000_000_004n,
        topic: "/rosout",
      }),
    ]);
  });

  it("returns no rows when logRows is empty and no fallback message exists", () => {
    const rows = logConsoleRowsFromDecodedMessage(
      decodedMessage({
        attributes: {},
        topic: "/empty",
      }),
    );

    expect(rows).toEqual([]);
  });
});

function decodedMessage({
  attributes,
  timelineTimeNs = 1n,
  topic,
}: {
  readonly attributes: NonNullable<
    McapDecodedMessage["decoded"]["output"]["attributes"]
  >;
  readonly timelineTimeNs?: bigint;
  readonly topic: string;
}): McapDecodedMessage {
  return {
    activeTimeline: "log",
    channelId: 1,
    decoded: {
      decoderId: "test",
      decoderVersion: "1",
      output: { attributes },
      payload: {
        encoding: "json",
        schema: "test",
        schemaEncoding: "jsonschema",
      },
    },
    encodedPayloadBytes: 1,
    logTimeNs: timelineTimeNs,
    publishTimeNs: timelineTimeNs,
    sequence: 3,
    timelineTimeNs,
    topic,
  };
}
