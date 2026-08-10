import { describe, expect, it } from "vitest";
import { DiagnosticStateProjector } from "./diagnostic-state-projector";
import {
  diagnosticConsoleIdentity,
  type EpisodeLogConsoleRow,
} from "../../../visualization/logs/log-console-rows";

describe("DiagnosticStateProjector", () => {
  it("holds a predecessor state older than the log window and reports its age", () => {
    const projector = new DiagnosticStateProjector();
    const seed = diagnosticRow(5_000_000_000, "lidar", "OK");

    const states = projector.project({
      generation: "seek-1",
      orderedEvents: [],
      playheadTimeNs: 45_000_000_000n,
      seedEvents: [seed],
      sourceCoverage: "complete",
    });

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      ageNs: 40_000_000_000n,
      freshness: "stale",
      row: seed,
    });
  });

  it("folds partial diagnostic arrays as independent identity upserts", () => {
    const projector = new DiagnosticStateProjector();
    const lidarOk = diagnosticRow(1, "lidar", "OK");
    const cameraWarn = diagnosticRow(2, "camera", "WARN", "warn");
    const lidarError = diagnosticRow(3, "lidar", "ERROR", "error");

    const states = projector.project({
      generation: "follow",
      orderedEvents: [lidarOk, cameraWarn, lidarError],
      playheadTimeNs: 3n,
      seedEvents: [],
      sourceCoverage: "complete",
    });

    expect(states.map((state) => state.row)).toEqual([lidarError, cameraWarn]);
  });

  it("never folds prefetched future events before the playhead", () => {
    const projector = new DiagnosticStateProjector();
    const current = diagnosticRow(5, "driver", "OK");
    const future = diagnosticRow(11, "driver", "ERROR", "error");
    const events = [current, future];

    expect(
      projector.project({
        generation: "follow",
        orderedEvents: events,
        playheadTimeNs: 10n,
        seedEvents: [],
        sourceCoverage: "complete",
      })[0]?.row,
    ).toBe(current);
    expect(
      projector.project({
        generation: "follow",
        orderedEvents: events,
        playheadTimeNs: 11n,
        seedEvents: [],
        sourceCoverage: "complete",
      })[0]?.row,
    ).toBe(future);
  });

  it("uses playback time for age despite a divergent embedded stamp", () => {
    const projector = new DiagnosticStateProjector();
    const row = diagnosticRow(8, "driver", "OK", "info", 999_000n);

    const [state] = projector.project({
      generation: "timeline",
      orderedEvents: [row],
      playheadTimeNs: 10n,
      seedEvents: [],
      sourceCoverage: "complete",
    });

    expect(state?.ageNs).toBe(2n);
  });

  it("keeps freshness unknown while loading and after a proven coverage gap", () => {
    const projector = new DiagnosticStateProjector();
    const row = diagnosticRow(1, "driver", "OK");
    const request = {
      generation: "coverage",
      orderedEvents: [row],
      playheadTimeNs: 2n,
      seedEvents: [],
    } as const;

    expect(
      projector.project({ ...request, sourceCoverage: "pending" })[0]
        ?.freshness,
    ).toBe("unknown");
    expect(
      projector.project({ ...request, sourceCoverage: "complete" })[0]
        ?.freshness,
    ).toBe("current");
    expect(
      projector.project({ ...request, sourceCoverage: "incomplete" })[0]
        ?.freshness,
    ).toBe("unknown");
    expect(
      projector.project({ ...request, sourceCoverage: "complete" })[0]
        ?.freshness,
    ).toBe("unknown");
  });

  it("resets held state on a seek generation", () => {
    const projector = new DiagnosticStateProjector();
    projector.project({
      generation: "before-seek",
      orderedEvents: [diagnosticRow(20, "future", "ERROR", "error")],
      playheadTimeNs: 20n,
      seedEvents: [],
      sourceCoverage: "complete",
    });

    expect(
      projector.project({
        generation: "after-seek",
        orderedEvents: [diagnosticRow(2, "past", "OK")],
        playheadTimeNs: 2n,
        seedEvents: [],
        sourceCoverage: "complete",
      }),
    ).toHaveLength(1);
  });
});

function diagnosticRow(
  timelineTime: number,
  name: string,
  status: string,
  level: EpisodeLogConsoleRow["level"] = "info",
  messageTimeNs?: bigint,
): EpisodeLogConsoleRow {
  const stream = "/diagnostics";
  return {
    details: [],
    diagnosticId: diagnosticConsoleIdentity(stream, "robot", name),
    groupLabel: `robot / ${name}`,
    hardwareId: "robot",
    id: `${name}-${timelineTime}`,
    kind: "diagnostic",
    level,
    message: `${name} ${status}`,
    messageTimeNs,
    name,
    status,
    stream,
    timelineTimeNs: BigInt(timelineTime),
  };
}
