import { describe, expect, it } from "vitest";
import { createMockProjectionEventsClient } from "./mock";
import type { ProjectionEvent } from "./types";

const NS = 1_000_000_000n;

describe("createMockProjectionEventsClient", () => {
  it("returns the canned nuscenes-shaped events", async () => {
    const client = createMockProjectionEventsClient();

    const events = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
    });

    const ids = new Set(events.map((e) => e.id));
    expect(ids).toEqual(
      new Set(["pedestrian_fast", "high_steering", "imu_acceleration_spike"]),
    );
    // Every logical event arrives as >=1 unmerged occurrence row.
    expect(events.length).toBeGreaterThan(ids.size);
  });

  it("echoes the requested episodeId onto every row", async () => {
    const client = createMockProjectionEventsClient();

    const events = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-42",
    });

    expect(events.every((e) => e.episodeId === "episode-42")).toBe(true);
  });

  it("emits recording-relative ns (starts at/after 0)", async () => {
    const client = createMockProjectionEventsClient();

    const events = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
    });

    expect(events.every((e) => e.startTimestampNs >= 0n)).toBe(true);
    expect(events.every((e) => e.endTimestampNs > e.startTimestampNs)).toBe(
      true,
    );
  });

  it("filters by event ids", async () => {
    const client = createMockProjectionEventsClient();

    const events = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
      filter: { eventIds: ["high_steering"] },
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.id === "high_steering")).toBe(true);
  });

  it("filters by an overlapping time window", async () => {
    const events: readonly Omit<ProjectionEvent, "episodeId">[] = [
      {
        id: "a",
        name: "A",
        startTimestampNs: 1n * NS,
        endTimestampNs: 2n * NS,
      },
      {
        id: "b",
        name: "B",
        startTimestampNs: 5n * NS,
        endTimestampNs: 6n * NS,
      },
      {
        id: "c",
        name: "C",
        startTimestampNs: 10n * NS,
        endTimestampNs: 11n * NS,
      },
    ];
    const client = createMockProjectionEventsClient(events);

    const result = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
      filter: { startNs: 4n * NS, stopNs: 7n * NS },
    });

    expect(result.map((e) => e.id)).toEqual(["b"]);
  });
});
