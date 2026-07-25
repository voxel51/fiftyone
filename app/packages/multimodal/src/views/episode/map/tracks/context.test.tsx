import { isPlayingAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../../query/bytes";
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import type { DecodedFrame } from "../../../../ir";
import type { EpisodeSession } from "../../../../ports";
import {
  LocationTracksBridge,
  LocationTracksProvider,
  useLocationTracksContext,
} from "./context";
import { setNetworkHealth } from "../../playback/network-health";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LocationTracksBridge", () => {
  it("does not read until a map consumer demands a location stream", () => {
    const source = createSource("drive");
    const session = createSession();
    const view = render(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        streams={[]}
      />,
    );
    expect(session.read).not.toHaveBeenCalled();

    view.rerender(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        streams={["/gps"]}
      />,
    );
    expect(session.read).toHaveBeenCalledTimes(1);
  });

  it("starts full-track reads immediately, uses the bulk lane, and publishes no-fix gaps", async () => {
    const source = createSource("drive");
    const locationSources = [locationSource("/gps")];
    const session = createSession(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
      yield locationMessage(2_000_000_000n, 37.001, -122.001, -1);
      yield locationMessage(3_000_000_000n, 37.002, -122.002, 0);
    });

    render(
      <Harness
        session={session}
        locationSources={locationSources}
        source={source}
      />,
    );

    expect(session.read).toHaveBeenCalledWith({
      limit: 25_000,
      priority: "bulk",
      streams: ["/gps"],
      window: session.manifest.timeRange,
    });
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:2:full",
      );
    });
  });

  it("publishes route segments progressively while the full scan continues", async () => {
    let releaseRemainder: () => void = () => undefined;
    const remainder = new Promise<void>((resolve) => {
      releaseRemainder = resolve;
    });
    const source = createSource("drive");
    const session = createSession(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
      await remainder;
      yield locationMessage(2_000_000_000n, 37.001, -122.001, 0);
    });

    render(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        streams={["/gps"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:loading:1:1:full",
      );
    });

    releaseRemainder();
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:1:full",
      );
    });
  });

  it("marks streams as error when the bulk read rejects", async () => {
    const source = createSource("drive");
    const locationSources = [locationSource("/gps")];
    const session = createSession(async function* () {
      throw new Error("boom");
      yield locationMessage(0n, 0, 0, 0);
    });

    render(
      <Harness
        session={session}
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
    setNetworkHealth(store, {
      busyFraction: 1,
      busyThroughputBytesPerSec: 1,
      limited: true,
      throughputBytesPerSec: 1,
      throughputPlannable: true,
      updatedAtMs: 0,
    });
    const session = createSession(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
    });

    render(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );

    expect(session.read).not.toHaveBeenCalled();

    store.set(isPlayingAtom, false);
    await advanceTimers(1_999);
    expect(session.read).not.toHaveBeenCalled();

    await advanceTimers(1);
    expect(session.read).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:ready:1:1:full",
    );
  });

  it("marks the track truncated when the read limit is reached before usable fixes", async () => {
    const source = createSource("drive");
    const session = createSession(async function* () {
      for (let index = 0; index < 25_000; index += 1) {
        yield nonLocationMessage(BigInt(index));
      }
    });

    render(
      <Harness
        session={session}
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
  session,
  locationSources,
  source,
  store,
  streams,
}: {
  readonly session: EpisodeSession;
  readonly locationSources: readonly SceneSource[];
  readonly source: ByteSourceDescriptor;
  readonly store?: ReturnType<typeof createStore>;
  readonly streams?: readonly string[];
}) {
  const body = (
    <LocationTracksProvider>
      <LocationTracksBridge
        session={session}
        locationSources={locationSources}
        sourceKey={source.sourceId}
        streams={streams}
      />
      <LocationTracksProbe />
    </LocationTracksProvider>
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
  const tracks = useLocationTracksContext();
  return (
    <div data-testid="location-tracks">
      {[...tracks.entries()]
        .map(
          ([stream, state]) =>
            `${stream}:${state.status}:${state.pointCount}:${state.segments.length}:${
              state.truncated ? "truncated" : "full"
            }`,
        )
        .join("|")}
    </div>
  );
}

function createSession(
  messages: () => AsyncGenerator<DecodedFrame, void, void> = emptyMessages,
): EpisodeSession {
  const manifest = {
    episodeId: "test",
    streams: [],
    timeDomain: { id: "log", kind: "timestamp" as const },
    timeRange: { endNs: 25_000n, startNs: 0n },
  };
  return {
    dispose: vi.fn(),
    manifest,
    read: vi.fn(async function* (request) {
      for await (const frame of messages()) {
        yield {
          frames: [
            { ...frame, streamId: request.streams[0] ?? frame.streamId },
          ],
          stream: request.streams[0] ?? frame.streamId,
        };
      }
    }),
  };
}

async function* emptyMessages(): AsyncGenerator<DecodedFrame, void, void> {
  for (const message of [] as DecodedFrame[]) {
    yield message;
  }
}

function locationMessage(
  timelineTimeNs: bigint,
  latitude: number,
  longitude: number,
  fixStatus: number,
): DecodedFrame {
  return {
    output: {
      visualization: {
        fixStatus,
        kind: VISUALIZATION_KIND.LOCATION,
        latitude,
        longitude,
      },
    },
    streamId: "/gps",
    timestampNs: timelineTimeNs,
  } as unknown as DecodedFrame;
}

function nonLocationMessage(timelineTimeNs: bigint): DecodedFrame {
  return {
    output: {
      visualization: { kind: VISUALIZATION_KIND.POSE },
    },
    streamId: "/gps",
    timestampNs: timelineTimeNs,
  } as unknown as DecodedFrame;
}

function locationSource(id: string): SceneSource {
  return {
    id,
    label: id.replace(/^\//, ""),
    sourceName: id,
    type: "location",
  };
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
