import { isPlayingAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapDecodedMessage, McapResourceClient } from "../types";
import {
  McapLocationTracksBridge,
  McapLocationTracksProvider,
  useMcapLocationTracksContext,
} from "./mcap-location-tracks-context";
import { setMcapNetworkHealth } from "./mcap-network-health";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapLocationTracksBridge", () => {
  it("starts full-track reads immediately, uses the bulk lane, and publishes no-fix gaps", async () => {
    const source = createSource("drive");
    const locationSources = [locationSource("/gps")];
    const client = createClient(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
      yield locationMessage(2_000_000_000n, 37.001, -122.001, -1);
      yield locationMessage(3_000_000_000n, 37.002, -122.002, 0);
    });

    render(
      <Harness
        client={client}
        locationSources={locationSources}
        source={source}
      />,
    );

    expect(client.readDecodedMessages).toHaveBeenCalledWith(
      {
        activeTimeline: "log",
        limit: 25_000,
        source,
        topics: ["/gps"],
      },
      { priority: "bulk" },
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:2:full",
      );
    });
  });

  it("marks topics as error when the bulk read rejects", async () => {
    const source = createSource("drive");
    const locationSources = [locationSource("/gps")];
    const client = createClient(async function* () {
      throw new Error("boom");
      yield locationMessage(0n, 0, 0, 0);
    });

    render(
      <Harness
        client={client}
        locationSources={locationSources}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:error:0:0:full",
      );
    });
  });

  it("retries deferred track reads after playback pressure stands down", async () => {
    vi.useFakeTimers();
    const source = createSource("drive");
    const store = createStore();
    store.set(isPlayingAtom, true);
    setMcapNetworkHealth(store, {
      busyFraction: 1,
      busyThroughputBytesPerSec: 1,
      limited: true,
      throughputBytesPerSec: 1,
      throughputPlannable: true,
      updatedAtMs: 0,
    });
    const client = createClient(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
    });

    render(
      <Harness
        client={client}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );

    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    store.set(isPlayingAtom, false);
    await advanceTimers(1_999);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(client.readDecodedMessages).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:ready:1:1:full",
    );
  });

  it("marks the track truncated when the read limit is reached before usable fixes", async () => {
    const source = createSource("drive");
    const client = createClient(async function* () {
      for (let index = 0; index < 25_000; index += 1) {
        yield nonLocationMessage(BigInt(index));
      }
    });

    render(
      <Harness
        client={client}
        locationSources={[locationSource("/gps")]}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:0:0:truncated",
      );
    });
  });
});

function Harness({
  client,
  locationSources,
  source,
  store,
}: {
  readonly client: McapResourceClient;
  readonly locationSources: readonly SceneSource[];
  readonly source: ByteSourceDescriptor;
  readonly store?: ReturnType<typeof createStore>;
}) {
  const body = (
    <McapLocationTracksProvider>
      <McapLocationTracksBridge
        client={client}
        locationSources={locationSources}
        source={source}
      />
      <LocationTracksProbe />
    </McapLocationTracksProvider>
  );
  return store ? (
    <PlaybackStoreContext.Provider value={store}>
      {body}
    </PlaybackStoreContext.Provider>
  ) : (
    body
  );
}

function LocationTracksProbe() {
  const tracks = useMcapLocationTracksContext();
  return (
    <div data-testid="location-tracks">
      {[...tracks.entries()]
        .map(
          ([topic, state]) =>
            `${topic}:${state.status}:${state.pointCount}:${state.segments.length}:${
              state.truncated ? "truncated" : "full"
            }`,
        )
        .join("|")}
    </div>
  );
}

function createClient(
  messages: () => AsyncGenerator<
    McapDecodedMessage,
    void,
    void
  > = emptyMessages,
): McapResourceClient {
  return {
    dispose: vi.fn(),
    enumerateNumericFields: vi.fn(async () => []),
    readDecodedMessages: vi.fn(messages),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 0n,
      fields: [],
      messageCount: 0,
      topic: "",
      truncated: false,
    })),
    readRawMessageRecord: vi.fn(),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopicTimeBounds: vi.fn(async () => []),
    readTopics: vi.fn(async () => []),
  };
}

async function* emptyMessages(): AsyncGenerator<
  McapDecodedMessage,
  void,
  void
> {
  for (const message of [] as McapDecodedMessage[]) {
    yield message;
  }
}

function locationMessage(
  timelineTimeNs: bigint,
  latitude: number,
  longitude: number,
  fixStatus: number,
): McapDecodedMessage {
  return {
    decoded: {
      output: {
        visualization: {
          fixStatus,
          kind: VISUALIZATION_KIND.LOCATION,
          latitude,
          longitude,
        },
      },
    },
    timelineTimeNs,
  } as unknown as McapDecodedMessage;
}

function nonLocationMessage(timelineTimeNs: bigint): McapDecodedMessage {
  return {
    decoded: {
      output: {
        visualization: { kind: VISUALIZATION_KIND.POSE },
      },
    },
    timelineTimeNs,
  } as unknown as McapDecodedMessage;
}

function locationSource(id: string): SceneSource {
  return { id, label: id.replace(/^\//, ""), type: "location" };
}

function createSource(sourceId: string): ByteSourceDescriptor {
  return {
    sourceId,
    url: `memory://${sourceId}.mcap`,
  };
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
