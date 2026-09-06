import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EpisodePreviewSession, EpisodeSource } from "../../ports";
import { useEpisodePreviewSession } from "./use-episode-preview-session";

const previewHarness = vi.hoisted(() => ({
  openEpisodePreviewSession: vi.fn(),
}));

vi.mock("../../runtime", () => ({
  openEpisodePreviewSession: previewHarness.openEpisodePreviewSession,
}));

describe("useEpisodePreviewSession", () => {
  beforeEach(() => {
    previewHarness.openEpisodePreviewSession.mockReset();
  });

  it("never exposes the previous preview under a new source", async () => {
    const firstSession = createPreviewSession();
    const secondOpen = deferred<EpisodePreviewSession>();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    const renders: Array<{
      readonly session: EpisodePreviewSession | null;
      readonly source: EpisodeSource;
      readonly status: string;
    }> = [];
    previewHarness.openEpisodePreviewSession
      .mockResolvedValueOnce(firstSession)
      .mockReturnValueOnce(secondOpen.promise);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource }) => {
        const state = useEpisodePreviewSession(
          { mediaType: "group", path: `${source.episodeId}.mcap` },
          source,
          true,
        );
        renders.push({ session: state.session, source, status: state.status });
        return state;
      },
      { initialProps: { source: firstSource } },
    );

    await waitFor(() => expect(result.current.session).toBe(firstSession));
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
    expect(result.current.status).toBe("loading");
    expect(firstSession.dispose).toHaveBeenCalledOnce();

    const secondSession = createPreviewSession();
    secondOpen.resolve(secondSession);
    await waitFor(() => expect(result.current.session).toBe(secondSession));

    unmount();
    expect(secondSession.dispose).toHaveBeenCalledOnce();
  });

  it("aborts an abandoned preview open when the source changes", async () => {
    const secondSession = createPreviewSession();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    previewHarness.openEpisodePreviewSession
      .mockReturnValueOnce(new Promise<EpisodePreviewSession>(() => undefined))
      .mockResolvedValueOnce(secondSession);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource }) =>
        useEpisodePreviewSession(
          { mediaType: "group", path: `${source.episodeId}.mcap` },
          source,
          true,
        ),
      { initialProps: { source: firstSource } },
    );

    await waitFor(() =>
      expect(previewHarness.openEpisodePreviewSession).toHaveBeenCalledOnce(),
    );
    const firstOpenOptions =
      previewHarness.openEpisodePreviewSession.mock.calls[0]?.[2];
    expect(firstOpenOptions?.signal.aborted).toBe(false);

    rerender({ source: secondSource });

    expect(firstOpenOptions?.signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.session).toBe(secondSession));
    unmount();
  });

  it("releases the preview session when modal activation disables grid demand", async () => {
    const session = createPreviewSession();
    const source = createSource("sample-a");
    previewHarness.openEpisodePreviewSession.mockResolvedValue(session);

    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useEpisodePreviewSession(
          { mediaType: "group", path: "sample-a.mcap" },
          source,
          enabled,
        ),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.session).toBe(session));

    rerender({ enabled: false });

    expect(result.current).toMatchObject({ session: null, status: "idle" });
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(previewHarness.openEpisodePreviewSession).toHaveBeenCalledOnce();
  });

  it("disposes a preview that resolves after its request loses ownership", async () => {
    const firstOpen = deferred<EpisodePreviewSession>();
    const secondSession = createPreviewSession();
    const firstSource = createSource("sample-a");
    const secondSource = createSource("sample-b");
    previewHarness.openEpisodePreviewSession
      .mockReturnValueOnce(firstOpen.promise)
      .mockResolvedValueOnce(secondSession);

    const { rerender, result, unmount } = renderHook(
      ({ source }: { source: EpisodeSource }) =>
        useEpisodePreviewSession(
          { mediaType: "group", path: `${source.episodeId}.mcap` },
          source,
          true,
        ),
      { initialProps: { source: firstSource } },
    );

    await waitFor(() =>
      expect(previewHarness.openEpisodePreviewSession).toHaveBeenCalledOnce(),
    );
    rerender({ source: secondSource });
    await waitFor(() => expect(result.current.session).toBe(secondSession));

    const lateSession = createPreviewSession();
    firstOpen.resolve(lateSession);
    await waitFor(() => expect(lateSession.dispose).toHaveBeenCalledOnce());
    expect(result.current.session).toBe(secondSession);

    unmount();
  });

  it("reports an unavailable adapter preview without leaking ownership", async () => {
    const source = createSource("sample-a");
    previewHarness.openEpisodePreviewSession.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useEpisodePreviewSession(
        { mediaType: "group", path: "sample-a.mcap" },
        source,
        true,
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.session).toBeNull();
  });
});

function createSource(episodeId: string): EpisodeSource {
  return {
    assets: {
      list: vi.fn(async () => []),
      resolve: vi.fn(),
    },
    episodeId,
  };
}

function createPreviewSession(): EpisodePreviewSession {
  return {
    dispose: vi.fn(),
  } as unknown as EpisodePreviewSession;
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
