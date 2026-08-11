import { isPlayingAtom, playheadAtom } from "@fiftyone/playback/runtime";
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createStore } from "jotai";
import { useEffect, useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../../query/bytes";
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import type { DecodedFrame, LocationVisualization } from "../../../../ir";
import { createTimelineIndex } from "../../../../runtime";
import type {
  BudgetedReadJob,
  BudgetedReadResult,
  EpisodeSession,
  SourceReadBudgetAccount,
} from "../../../../ports";
import {
  LocationTracksBridge,
  LocationTracksProvider,
  useLocationTracksContext,
} from "./context";
import { setNetworkHealth } from "../../playback/network-health";
import {
  DataStreamProvider,
  type DataStream,
  useSetDataStream,
} from "../../playback/data-stream-context";
import type { LocationTracks } from "./location-track";
import type { StreamContentFrame } from "../../playback/use-stream-values";

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
      signal: expect.any(AbortSignal),
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

  it("resumes bounded grants until the full route is ready", async () => {
    const source = createSource("drive");
    const session = createSession();
    const continuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockResolvedValueOnce(
        boundedResult({
          continuation,
          frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
          stopReason: "budget-exhausted",
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          frames: [locationMessage(2_000_000_000n, 37.001, -122.001, 0)],
          stopReason: "source-exhausted",
        }),
      );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;

    render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]?.[0]).not.toHaveProperty("continuation");
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      continuation,
      signal: expect.any(AbortSignal),
      streams: ["/gps"],
      window: session.manifest.timeRange,
    });
    expect(session.read).not.toHaveBeenCalled();
  });

  it("batches visible streams, reveals only the playhead horizon, and reuses forward progress on backward seeks", async () => {
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    const firstContinuation = {};
    const secondContinuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockResolvedValueOnce(
        boundedResult({
          continuation: firstContinuation,
          frames: [
            locationMessage(1_000_000_000n, 37, -122, 0, "/gps-a"),
            locationMessage(2_000_000_000n, 38, -121, 0, "/gps-a"),
            locationMessage(1_200_000_000n, 39, -120, 0, "/gps-b"),
          ],
          resumeAtNs: 3_000_000_000n,
          stopReason: "horizon-reached",
        }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          continuation: secondContinuation,
          frames: [
            locationMessage(3_000_000_000n, 40, -119, 0, "/gps-a"),
            locationMessage(3_000_000_000n, 41, -118, 0, "/gps-b"),
          ],
          resumeAtNs: 5_000_000_000n,
          stopReason: "horizon-reached",
        }),
      );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;

    render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={["/gps-a", "/gps-b"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:1:1:full|/gps-b:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toMatchObject({
      admissionEndNs: 1_500_000_000n,
      streams: ["/gps-a", "/gps-b"],
      window: session.manifest.timeRange,
    });

    act(() => store.set(playheadAtom, 3.5));
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:3:1:full|/gps-b:ready:2:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      admissionEndNs: 3_500_000_000n,
      continuation: firstContinuation,
      streams: ["/gps-a", "/gps-b"],
      window: session.manifest.timeRange,
    });

    act(() => store.set(playheadAtom, 1.5));
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:1:1:full|/gps-b:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("coalesces forward publication but flushes backward seeks and pause", async () => {
    vi.useFakeTimers();
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    const publications: LocationTracks[] = [];
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        continuation: {},
        frames: [
          locationMessage(5_000_000_000n, 37, -122, 0),
          locationMessage(5_100_000_000n, 37.001, -122.001, 0),
          locationMessage(5_200_000_000n, 37.002, -122.002, 0),
          locationMessage(5_300_000_000n, 37.003, -122.003, 0),
        ],
        resumeAtNs: 10_000_000_000n,
        stopReason: "horizon-reached",
      }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    render(
      <Harness
        budgetAccount={budgetAccount}
        onTracks={(tracks) => publications.push(tracks)}
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={5}
        source={source}
        store={store}
      />,
    );
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:ready:1:1:full",
    );

    publications.length = 0;
    act(() => store.set(isPlayingAtom, true));
    act(() => store.set(playheadAtom, 5.1));
    act(() => store.set(playheadAtom, 5.2));
    act(() => store.set(playheadAtom, 5.3));
    expect(publications).toHaveLength(0);

    await advanceTimers(100);
    expect(publications).toHaveLength(1);
    expect(publications[0].get("/gps")?.pointCount).toBe(4);

    act(() => store.set(playheadAtom, 5.05));
    expect(publications).toHaveLength(2);
    expect(publications[1].get("/gps")?.pointCount).toBe(1);

    act(() => store.set(playheadAtom, 5.3));
    expect(publications).toHaveLength(2);
    act(() => store.set(isPlayingAtom, false));
    expect(publications).toHaveLength(3);
    expect(publications[2].get("/gps")?.pointCount).toBe(4);
    await advanceTimers(100);
    expect(publications).toHaveLength(3);
  });

  it("retains admitted route data across map close and reopen", async () => {
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        continuation: {},
        frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
        resumeAtNs: 3_000_000_000n,
        stopReason: "horizon-reached",
      }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={["/gps"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);

    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={[]}
      />,
    );
    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={["/gps"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shares per-stream storage across selection reads without sharing jobs", async () => {
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    const read = vi.fn<BudgetedReadJob["read"]>((request) => {
      const frames = request.streams.includes("/gps-b")
        ? [
            locationMessage(1_000_000_000n, 37, -122, 0, "/gps-a"),
            locationMessage(1_000_000_000n, 39, -120, 0, "/gps-b"),
          ]
        : [
            locationMessage(1_000_000_000n, 37, -122, 0, "/gps-a"),
            locationMessage(1_000_000_000n, 37, -122, 0, "/gps-a"),
            locationMessage(1_000_000_000n, 38, -121, 0, "/gps-a"),
          ];
      return Promise.resolve(
        boundedResult({ frames, stopReason: "source-exhausted" }),
      );
    });
    const createJob = vi.fn(() => ({ read }));
    const budgetAccount = {
      createJob,
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        source={source}
        store={store}
        streams={["/gps-a"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:2:1:full",
      );
    });

    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        source={source}
        store={store}
        streams={["/gps-a", "/gps-b"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:2:1:full|/gps-b:ready:1:1:full",
      );
    });

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([request]) => request.streams)).toEqual([
      ["/gps-a"],
      ["/gps-a", "/gps-b"],
    ]);
  });

  it("discards a budgeted result that resolves after its selection is aborted", async () => {
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    const publications: LocationTracks[] = [];
    const onTracks = (tracks: LocationTracks) => publications.push(tracks);
    let firstSignal: AbortSignal | undefined;
    let resolveFirst: (result: BudgetedReadResult) => void = () => undefined;
    let gpsAAttempts = 0;
    const read = vi.fn<BudgetedReadJob["read"]>((request) => {
      if (request.streams[0] === "/gps-a") {
        gpsAAttempts += 1;
        if (gpsAAttempts === 1) {
          firstSignal = request.signal;
          return new Promise<BudgetedReadResult>((resolve) => {
            resolveFirst = resolve;
          });
        }
      }
      const stream = request.streams[0] ?? "/gps-a";
      return Promise.resolve(
        boundedResult({
          frames: [locationMessage(1_000_000_000n, 37, -122, 0, stream)],
          stopReason: "source-exhausted",
        }),
      );
    });
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        onTracks={onTracks}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        source={source}
        store={store}
        streams={["/gps-a"]}
      />,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        onTracks={onTracks}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        source={source}
        store={store}
        streams={["/gps-b"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-b:ready:1:1:full",
      );
    });
    expect(firstSignal?.aborted).toBe(true);
    publications.length = 0;

    await act(async () => {
      resolveFirst(
        boundedResult({
          frames: [locationMessage(1_000_000_000n, 50, 10, 0, "/gps-a")],
          stopReason: "source-exhausted",
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps-b:ready:1:1:full",
    );
    expect(publications).toHaveLength(0);
    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        onTracks={onTracks}
        session={session}
        locationSources={[locationSource("/gps-a"), locationSource("/gps-b")]}
        source={source}
        store={store}
        streams={["/gps-a"]}
      />,
    );

    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(read.mock.calls[2]?.[0].streams).toEqual(["/gps-a"]);
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps-a:ready:1:1:full",
      );
    });
  });

  it("falls back to exact local reads when the shared account is exhausted", async () => {
    const source = {
      ...createSource("local-drive"),
      readProfile: "local" as const,
    };
    const session = createSession(async function* () {
      yield locationMessage(1_000_000_000n, 37, -122, 0);
      yield locationMessage(2_000_000_000n, 37.001, -122.001, 0);
    });
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
        stopReason: "account-exhausted",
      }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;

    render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(session.read).toHaveBeenCalledTimes(1);
  });

  it("reports exhausted remote history as partial without bypassing its budget", async () => {
    const source = createSource("remote-drive");
    const session = createSession();
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
        stopReason: "account-exhausted",
      }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;

    render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:truncated",
      );
    });
    expect(session.read).not.toHaveBeenCalled();
  });

  it("extends partial remote routes with admitted current frames", async () => {
    const source = createSource("remote-drive");
    const session = createSession();
    const store = createStore();
    const read = vi.fn<BudgetedReadJob["read"]>().mockResolvedValue(
      boundedResult({
        frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
        stopReason: "account-exhausted",
      }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        liveFrames={[liveLocationFrame(10_000_000_000n, 37.001, -122.001)]}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:2:1:truncated",
      );
    });
    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        liveFrames={[liveLocationFrame(20_000_000_000n, 37.002, -122.002)]}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:3:1:truncated",
      );
    });

    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        liveFrames={[liveLocationFrame(20_000_000_000n, 37.002, -122.002)]}
        playheadSec={5}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:truncated",
      );
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(session.read).not.toHaveBeenCalled();
  });

  it("lets an admitted grant finish when the playhead seeks backward", async () => {
    const source = createSource("drive");
    const session = createSession();
    const store = createStore();
    let activeSignal: AbortSignal | undefined;
    const read = vi.fn<BudgetedReadJob["read"]>(
      (request) =>
        new Promise<BudgetedReadResult>((_resolve, reject) => {
          activeSignal = request.signal;
          request.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={5}
        source={source}
        store={store}
      />,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    act(() => store.set(playheadAtom, 1));
    expect(activeSignal?.aborted).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(activeSignal?.aborted).toBe(true);
  });

  it("rolls back a cancelled fallback slice before reopening", async () => {
    const source = createSource("drive");
    const baseSession = createSession();
    let readCount = 0;
    const read = vi.fn<EpisodeSession["read"]>(async function* (request) {
      readCount += 1;
      yield {
        frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
        stream: "/gps",
      };
      if (readCount === 1) {
        await new Promise<void>((_resolve, reject) => {
          request.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
    });
    const session: EpisodeSession = { ...baseSession, read };
    const store = createStore();
    const view = render(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={["/gps"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:loading:1:1:full",
      );
    });

    view.rerender(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={[]}
      />,
    );
    view.rerender(
      <Harness
        session={session}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={source}
        store={store}
        streams={["/gps"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("cancels active work and discards cached routes on a source change", async () => {
    const firstSource = createSource("first");
    const secondSource = createSource("second");
    const firstSession = createSession();
    const secondSession = createSession();
    const store = createStore();
    let firstSignal: AbortSignal | undefined;
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockImplementationOnce(
        (request) =>
          new Promise<BudgetedReadResult>((_resolve, reject) => {
            firstSignal = request.signal;
            request.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      )
      .mockResolvedValueOnce(
        boundedResult({
          continuation: {},
          frames: [locationMessage(1_000_000_000n, 42, -71, 0)],
          resumeAtNs: 3_000_000_000n,
          stopReason: "horizon-reached",
        }),
      );
    const budgetAccount = {
      createJob: () => ({ read }),
    } as unknown as SourceReadBudgetAccount;
    const view = render(
      <Harness
        budgetAccount={budgetAccount}
        session={firstSession}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={firstSource}
        store={store}
      />,
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    view.rerender(
      <Harness
        budgetAccount={budgetAccount}
        session={secondSession}
        locationSources={[locationSource("/gps")]}
        playheadSec={1.5}
        source={secondSource}
        store={store}
      />,
    );

    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:full",
      );
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps bounded progress when playback pressure interrupts the route", async () => {
    vi.useFakeTimers();
    const source = createSource("drive");
    const store = createStore();
    const session = createSession();
    const continuation = {};
    const read = vi
      .fn<BudgetedReadJob["read"]>()
      .mockImplementationOnce(async () => {
        store.set(isPlayingAtom, true);
        setNetworkHealth(store, {
          busyFraction: 1,
          busyThroughputBytesPerSec: 1,
          limited: true,
          throughputBytesPerSec: 1,
          throughputPlannable: true,
          updatedAtMs: 0,
        });
        return boundedResult({
          continuation,
          frames: [locationMessage(1_000_000_000n, 37, -122, 0)],
          stopReason: "budget-exhausted",
        });
      })
      .mockResolvedValueOnce(
        boundedResult({
          frames: [locationMessage(2_000_000_000n, 37.001, -122.001, 0)],
          stopReason: "source-exhausted",
        }),
      );
    const createJob = vi.fn(() => ({ read }));
    const budgetAccount = {
      createJob,
    } as unknown as SourceReadBudgetAccount;

    render(
      <Harness
        budgetAccount={budgetAccount}
        session={session}
        locationSources={[locationSource("/gps")]}
        source={source}
        store={store}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:loading:1:1:full",
    );

    store.set(isPlayingAtom, false);
    await advanceTimers(2_000);
    expect(screen.getByTestId("location-tracks").textContent).toBe(
      "/gps:ready:2:1:full",
    );
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]?.[0]).toMatchObject({ continuation });
  });

  it("marks streams as error when the bulk read rejects", async () => {
    const source = createSource("drive");
    const locationSources = [locationSource("/gps")];
    let attempt = 0;
    const session = createSession(async function* () {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
      yield locationMessage(1_000_000_000n, 37, -122, 0);
    });

    const view = render(
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

    view.rerender(
      <Harness
        session={session}
        locationSources={locationSources}
        source={source}
        streams={[]}
      />,
    );
    view.rerender(
      <Harness
        session={session}
        locationSources={locationSources}
        source={source}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("location-tracks").textContent).toBe(
        "/gps:ready:1:1:full",
      );
    });
    expect(session.read).toHaveBeenCalledTimes(2);
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
  budgetAccount,
  liveFrames,
  onTracks,
  session,
  locationSources,
  playheadSec = 25,
  source,
  store,
  streams,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount;
  readonly liveFrames?: readonly (StreamContentFrame<LocationVisualization> | null)[];
  readonly onTracks?: (tracks: LocationTracks) => void;
  readonly session: EpisodeSession;
  readonly locationSources: readonly SceneSource[];
  readonly playheadSec?: number;
  readonly source: ByteSourceDescriptor;
  readonly store?: ReturnType<typeof createStore>;
  readonly streams?: readonly string[];
}) {
  const playbackStore = useMemo(() => store ?? createStore(), [store]);
  playbackStore.set(playheadAtom, playheadSec);
  const body = (
    <LocationTracksProvider>
      <DataStreamProvider>
        <FakeDataStream session={session} sourceKey={source.sourceId} />
        <LocationTracksBridge
          budgetAccount={budgetAccount}
          liveFrames={liveFrames}
          session={session}
          locationSources={locationSources}
          sourceReadProfile={source.readProfile}
          sourceKey={source.sourceId}
          streams={streams}
        />
        <LocationTracksProbe onTracks={onTracks} />
      </DataStreamProvider>
    </LocationTracksProvider>
  );
  return (
    <PlaybackStoreContext.Provider value={playbackStore}>
      {body}
    </PlaybackStoreContext.Provider>
  );
}

function liveLocationFrame(
  timeNs: bigint,
  latitude: number,
  longitude: number,
): StreamContentFrame<LocationVisualization> {
  const visualization = locationMessage(timeNs, latitude, longitude, 0).output
    .visualization;
  if (!visualization || visualization.kind !== VISUALIZATION_KIND.LOCATION) {
    throw new Error("expected a location visualization");
  }
  return { contentTimeNs: timeNs, frame: visualization };
}

function FakeDataStream({
  session,
  sourceKey,
}: {
  readonly session: EpisodeSession;
  readonly sourceKey: string;
}) {
  const setDataStream = useSetDataStream();
  useEffect(() => {
    const timeline = createTimelineIndex({
      endNs: session.manifest.timeRange.endNs,
      startNs: session.manifest.timeRange.startNs,
    });
    const stream: DataStream = {
      getStreamCache: () => undefined,
      getTimelineIndex: () => timeline,
      sourceKey,
      subscribeToStream: () => () => undefined,
    };
    setDataStream(stream);
    return () => setDataStream(null);
  }, [session, setDataStream, sourceKey]);
  return null;
}

function boundedResult({
  continuation,
  frames,
  resumeAtNs,
  stopReason,
}: {
  readonly continuation?: object;
  readonly frames: readonly DecodedFrame[];
  readonly resumeAtNs?: bigint;
  readonly stopReason: BudgetedReadResult["stopReason"];
}): BudgetedReadResult {
  const framesByStream = new Map<string, DecodedFrame[]>();
  for (const frame of frames) {
    let streamFrames = framesByStream.get(frame.streamId);
    if (!streamFrames) {
      streamFrames = [];
      framesByStream.set(frame.streamId, streamFrames);
    }
    streamFrames.push(frame);
  }
  return {
    batches: [...framesByStream].map(([stream, streamFrames]) => ({
      frames: streamFrames,
      stream,
    })),
    ...(continuation ? { continuation } : {}),
    coverageByStream: new Map(),
    ...(resumeAtNs !== undefined ? { resumeAtNs } : {}),
    stopReason,
    usage: {
      chunksOpened: 1,
      decompressedBytes: 1,
      decompressionCacheHits: 0,
      elapsedMs: 1,
      logicalSourceBytes: 1,
      logicalUncompressedBytes: 1,
      messagesDecoded: frames.length,
      transferredBytes: 1,
    },
  };
}

function LocationTracksProbe({
  onTracks,
}: {
  readonly onTracks?: (tracks: LocationTracks) => void;
}) {
  const tracks = useLocationTracksContext();
  useEffect(() => {
    onTracks?.(tracks);
  }, [onTracks, tracks]);
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
    timeRange: { endNs: 25_000_000_000n, startNs: 0n },
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
  streamId = "/gps",
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
    streamId,
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
