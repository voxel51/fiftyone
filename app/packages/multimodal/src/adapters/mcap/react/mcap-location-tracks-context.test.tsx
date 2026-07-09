import { act, cleanup, render, screen } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("McapLocationTracksBridge", () => {
  it("delays full-track reads, uses the bulk lane, and publishes no-fix gaps", async () => {
    vi.useFakeTimers();
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

    await advanceTimers(1_499);
    expect(client.readDecodedMessages).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(client.readDecodedMessages).toHaveBeenCalledWith(
      {
        activeTimeline: "log",
        limit: 25_000,
        source,
        topics: ["/gps"],
      },
      { priority: "bulk" },
    );
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:ready:2:2",
    );
  });
});

function Harness({
  client,
  locationSources,
  source,
}: {
  readonly client: McapResourceClient;
  readonly locationSources: readonly SceneSource[];
  readonly source: ByteSourceDescriptor;
}) {
  return (
    <McapLocationTracksProvider>
      <McapLocationTracksBridge
        client={client}
        locationSources={locationSources}
        source={source}
      />
      <LocationTracksProbe />
    </McapLocationTracksProvider>
  );
}

function LocationTracksProbe() {
  const tracks = useMcapLocationTracksContext();
  return (
    <div data-testid="location-tracks">
      {[...tracks.entries()]
        .map(
          ([topic, state]) =>
            `${topic}:${state.status}:${state.pointCount}:${state.segments.length}`,
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
