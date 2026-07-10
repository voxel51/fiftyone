import { describe, expect, it, vi } from "vitest";
import { createProjectionEventsClient } from "./client";

type FetchConfig = {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
};

describe("createProjectionEventsClient", () => {
  it("builds the canonical episode events route path", async () => {
    const fetchFunction = createFetch({ events: [] });
    const client = createProjectionEventsClient({
      fetchFunction: fetchFunction as never,
    });

    await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
    });

    const url = routeUrl(fetchFunction.mock.calls[0][0].path);
    expect(fetchFunction.mock.calls[0][0].method).toBe("GET");
    expect(url.pathname).toBe("/dataset/dataset-id/episode/episode-id/events");
    expect(url.search).toBe("");
  });

  it("url-encodes dataset and episode ids", async () => {
    const fetchFunction = createFetch({ events: [] });
    const client = createProjectionEventsClient({
      fetchFunction: fetchFunction as never,
    });

    await client.listEpisodeProjectionEvents({
      datasetId: "dataset id",
      episodeId: "episode/id",
    });

    const url = routeUrl(fetchFunction.mock.calls[0][0].path);
    expect(url.pathname).toBe(
      "/dataset/dataset%20id/episode/episode%2Fid/events",
    );
  });

  it("serializes the filter as query params, bigints as decimal strings", async () => {
    const fetchFunction = createFetch({ events: [] });
    const client = createProjectionEventsClient({
      fetchFunction: fetchFunction as never,
    });

    await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
      filter: {
        projection: "derived_events",
        startNs: 1_531_281_439_803_619_000n,
        stopNs: 1_531_281_442_299_946_000n,
        eventIds: ["pedestrian_fast", "high_steering"],
      },
    });

    const url = routeUrl(fetchFunction.mock.calls[0][0].path);
    expect(url.searchParams.get("projection")).toBe("derived_events");
    expect(url.searchParams.get("start")).toBe("1531281439803619000");
    expect(url.searchParams.get("stop")).toBe("1531281442299946000");
    expect(url.searchParams.getAll("event_ids")).toEqual([
      "pedestrian_fast",
      "high_steering",
    ]);
  });

  it("parses int64 ns strings into bigint and maps snake_case fields", async () => {
    const fetchFunction = createFetch({
      events: [
        {
          id: "pedestrian_fast",
          name: "Fast pedestrian encounter",
          start_timestamp_ns: "1531281439803619000",
          end_timestamp_ns: "1531281440299931000",
          episode_id: "episode-id",
        },
      ],
    });
    const client = createProjectionEventsClient({
      fetchFunction: fetchFunction as never,
    });

    const events = await client.listEpisodeProjectionEvents({
      datasetId: "dataset-id",
      episodeId: "episode-id",
    });

    expect(events).toEqual([
      {
        id: "pedestrian_fast",
        name: "Fast pedestrian encounter",
        startTimestampNs: 1_531_281_439_803_619_000n,
        endTimestampNs: 1_531_281_440_299_931_000n,
        episodeId: "episode-id",
      },
    ]);
    // Precision past 2^53 must survive the string round-trip.
    expect(events[0].startTimestampNs.toString()).toBe("1531281439803619000");
  });

  it("reads the list from the `events` response field", async () => {
    const fetchFunction = createFetch({ events: [createEventDto()] });
    const client = createProjectionEventsClient({
      fetchFunction: fetchFunction as never,
    });

    await expect(
      client.listEpisodeProjectionEvents({
        datasetId: "dataset-id",
        episodeId: "episode-id",
      }),
    ).resolves.toHaveLength(1);
  });
});

function createFetch(response: unknown | ((config: FetchConfig) => unknown)) {
  return vi.fn(async (config: FetchConfig) => ({
    headers: new Headers(),
    response: typeof response === "function" ? response(config) : response,
  }));
}

function routeUrl(path: string) {
  return new URL(path, "http://fiftyone.test");
}

function createEventDto() {
  return {
    id: "high_steering",
    name: "High steering",
    start_timestamp_ns: "1535731258673424000",
    end_timestamp_ns: "1535731264732072000",
    episode_id: "episode-id",
  };
}
