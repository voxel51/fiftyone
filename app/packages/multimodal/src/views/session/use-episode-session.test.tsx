import { renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import type { EpisodeSession, EpisodeSource } from "../../ports";
import { useEpisodeSession } from "./use-episode-session";

type OpenEpisodeSession =
  (typeof import("../../runtime"))["openEpisodeSession"];

const sessionHarness = vi.hoisted(() => ({
  openEpisodeSession: vi.fn<OpenEpisodeSession>(),
}));

vi.mock("../../runtime", () => ({
  openEpisodeSession: sessionHarness.openEpisodeSession,
}));

describe("useEpisodeSession", () => {
  beforeEach(() => {
    sessionHarness.openEpisodeSession.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never exposes the previous session under a new source", async () => {
    const firstSession = createSession();
    const secondSession = createSession();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    const renders: Array<{
      readonly session: EpisodeSession | null;
      readonly source: EpisodeSource | null;
      readonly status: string;
    }> = [];
    sessionHarness.openEpisodeSession
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource | null }) => {
        const state = useEpisodeSession(
          {
            mediaType: "group",
            path: source ? `${source.episodeId}.mcap` : "",
          },
          source,
        );
        renders.push({ session: state.session, source, status: state.status });
        return state;
      },
      { initialProps: { source: firstSource as EpisodeSource | null } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(firstSession.activate).toHaveBeenCalledOnce();
    const firstRenderCount = renders.length;

    rerender({ source: secondSource });

    expect(
      renders
        .slice(firstRenderCount)
        .some(
          (render) =>
            render.source === secondSource &&
            render.session === firstSession &&
            render.status === "ready",
        ),
    ).toBe(false);
    expect(firstSession.dispose).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.session).toBe(secondSession));
    expect(secondSession.activate).toHaveBeenCalledOnce();

    unmount();
    expect(secondSession.dispose).toHaveBeenCalledOnce();
  });

  it("aborts an abandoned session open when the source changes", async () => {
    const secondSession = createSession();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    sessionHarness.openEpisodeSession
      .mockReturnValueOnce(new Promise<EpisodeSession>(() => undefined))
      .mockResolvedValueOnce(secondSession);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource }) =>
        useEpisodeSession(
          { mediaType: "group", path: `${source.episodeId}.mcap` },
          source,
        ),
      { initialProps: { source: firstSource } },
    );

    await waitFor(() =>
      expect(sessionHarness.openEpisodeSession).toHaveBeenCalledTimes(1),
    );
    const firstOpenOptions =
      sessionHarness.openEpisodeSession.mock.calls[0]?.[2];
    if (!firstOpenOptions?.signal) {
      throw new Error("Expected the session open signal");
    }
    expect(firstOpenOptions.signal.aborted).toBe(false);

    rerender({ source: secondSource });

    expect(firstOpenOptions.signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.session).toBe(secondSession));
    unmount();
  });

  it("disposes a session that resolves after its request loses ownership", async () => {
    const firstOpen = deferred<EpisodeSession>();
    const secondSession = createSession();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    sessionHarness.openEpisodeSession
      .mockReturnValueOnce(firstOpen.promise)
      .mockResolvedValueOnce(secondSession);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource }) =>
        useEpisodeSession(
          { mediaType: "group", path: `${source.episodeId}.mcap` },
          source,
        ),
      { initialProps: { source: firstSource } },
    );

    await waitFor(() =>
      expect(sessionHarness.openEpisodeSession).toHaveBeenCalledOnce(),
    );
    rerender({ source: secondSource });
    await waitFor(() => expect(result.current.session).toBe(secondSession));

    const lateSession = createSession();
    firstOpen.resolve(lateSession);
    await waitFor(() => expect(lateSession.dispose).toHaveBeenCalledOnce());
    expect(lateSession.activate).not.toHaveBeenCalled();
    expect(result.current.session).toBe(secondSession);

    unmount();
  });

  it("disposes a session that fails to activate", async () => {
    const session = createSession();
    const source = createSource("sample-a");
    if (!session.activate) {
      throw new Error("test session must support activation");
    }
    vi.mocked(session.activate).mockImplementation(() => {
      throw new Error("activation failed");
    });
    sessionHarness.openEpisodeSession.mockResolvedValue(session);

    const { result, unmount } = renderHook(() =>
      useEpisodeSession({ mediaType: "group", path: "sample-a.mcap" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("activation failed");
    expect(session.dispose).toHaveBeenCalledOnce();

    unmount();
    expect(session.dispose).toHaveBeenCalledOnce();
  });
});

function createSource(episodeId: string): EpisodeSource {
  return {
    assets: {
      list: vi.fn(() => Promise.resolve([])),
      resolve: vi.fn(),
    },
    episodeId,
  };
}

function createSession(): EpisodeSession & {
  readonly activate: Mock<() => void>;
  readonly dispose: Mock<() => void>;
} {
  return {
    activate: vi.fn(),
    dispose: vi.fn(),
    manifest: {
      episodeId: "test",
      streams: [],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: { endNs: 1n, startNs: 0n },
    },
    read: () => asyncValues([]),
  };
}

async function* asyncValues<Value>(values: readonly Value[]) {
  for await (const value of values) yield value;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
