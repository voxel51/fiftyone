import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EpisodeSourceReadyProvider } from "./source-ready-context";
import { AdjacentSamplePrewarm } from "./AdjacentSamplePrewarm";

const prewarmHarness = vi.hoisted(() => ({
  buffering: false,
  episodeSource: { episodeId: "next" },
  episodeSourceFromByteSource: vi.fn(),
  isPlayPending: false,
  neighbor: { sample: { _id: "next" } },
  openEpisodePreviewSession: vi.fn(),
  peekSourceBootstrap: vi.fn(),
  prewarmEpisodeSource: vi.fn(),
  previewDispose: vi.fn(),
  previewRead: vi.fn(),
  publishEpisodePreviewBootstrap: vi.fn(),
  publishSourceBootstrap: vi.fn(),
  source: { sourceId: "next", url: "memory://next.mcap" },
  sourceAccessKey: "next-access-key-0",
  sourceAccessKeyCounter: 0,
}));

vi.mock("@fiftyone/playback/runtime", () => ({
  getIsBuffering: () => prewarmHarness.buffering,
  getIsPlayPending: () => prewarmHarness.isPlayPending,
  useIsBuffering: () => prewarmHarness.buffering,
  useIsPlayPending: () => prewarmHarness.isPlayPending,
  usePlaybackStore: () => ({ get: () => ({ limited: false }) }),
}));

vi.mock("@fiftyone/state", () => ({
  modalNavigation: {
    get: () => ({ peek: vi.fn(async () => prewarmHarness.neighbor) }),
  },
}));

vi.mock("../../../runtime", () => ({
  episodeSourceAccessKey: () => prewarmHarness.sourceAccessKey,
  openEpisodePreviewSession: prewarmHarness.openEpisodePreviewSession,
  peekSourceBootstrap: prewarmHarness.peekSourceBootstrap,
  prewarmEpisodeSource: prewarmHarness.prewarmEpisodeSource,
  publishEpisodePreviewBootstrap: prewarmHarness.publishEpisodePreviewBootstrap,
  publishSourceBootstrap: prewarmHarness.publishSourceBootstrap,
}));

vi.mock("../../session/episode-source", () => ({
  episodeByteSourceFromSample: () => prewarmHarness.source,
  episodeSourceFromByteSource: prewarmHarness.episodeSourceFromByteSource,
  sampleDescriptorFromSample: () => ({
    mediaType: "group",
    path: "next.mcap",
  }),
}));

describe("AdjacentSamplePrewarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      callback();
      return 1;
    });
    prewarmHarness.buffering = false;
    prewarmHarness.isPlayPending = false;
    prewarmHarness.episodeSourceFromByteSource.mockReset();
    prewarmHarness.episodeSourceFromByteSource.mockReturnValue(
      prewarmHarness.episodeSource,
    );
    prewarmHarness.openEpisodePreviewSession.mockReset();
    prewarmHarness.peekSourceBootstrap.mockReset();
    prewarmHarness.prewarmEpisodeSource.mockReset();
    prewarmHarness.previewDispose.mockReset();
    prewarmHarness.previewRead.mockReset();
    prewarmHarness.publishEpisodePreviewBootstrap.mockReset();
    prewarmHarness.publishSourceBootstrap.mockReset();
    prewarmHarness.sourceAccessKey = `next-access-key-${++prewarmHarness.sourceAccessKeyCounter}`;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publishes an adjacent poster before the heavier byte prewarm", async () => {
    const result = {
      frame: {
        image: {
          bytes: new Uint8Array([1, 2, 3]),
          kind: "encoded-image",
          mimeType: "image/jpeg",
        },
        kind: "image",
      },
      status: "ready",
      streamId: "/camera/front",
      streamSourceName: "/camera/front",
      streamSourceNames: ["/camera/front"],
    } as const;
    prewarmHarness.peekSourceBootstrap
      .mockReturnValueOnce(null)
      .mockReturnValue({ manifest: {}, poster: result.frame });
    prewarmHarness.previewRead.mockResolvedValue(result);
    prewarmHarness.openEpisodePreviewSession.mockResolvedValue({
      dispose: prewarmHarness.previewDispose,
      read: prewarmHarness.previewRead,
    });
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);

    render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "current" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );

    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.previewRead).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ priority: "idle" }),
    );
    expect(prewarmHarness.publishEpisodePreviewBootstrap).toHaveBeenCalledWith(
      prewarmHarness.source,
      result,
    );
    expect(prewarmHarness.previewDispose).toHaveBeenCalledOnce();
    expect(prewarmHarness.prewarmEpisodeSource).toHaveBeenCalledOnce();
    expect(
      prewarmHarness.publishEpisodePreviewBootstrap.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prewarmHarness.prewarmEpisodeSource.mock.invocationCallOrder[0],
    );
  });

  it("passes preview-derived hints to the byte prewarm", async () => {
    const manifest = { streams: [] } as const;
    const timeline = {
      endNs: 30n,
      startNs: 10n,
      timeDomainId: "recording",
    } as const;
    const result = {
      bootstrapManifest: manifest,
      bootstrapTimeline: timeline,
      frame: {
        image: {
          bytes: new Uint8Array([1, 2, 3]),
          kind: "encoded-image",
          mimeType: "image/jpeg",
        },
        kind: "image",
      },
      status: "ready",
      streamId: "/camera/front",
      streamSourceName: "/camera/front",
      streamSourceNames: ["/camera/front"],
    } as const;
    let cachedHints: {
      manifest: typeof manifest;
      timeline: typeof timeline;
    } | null = null;
    prewarmHarness.peekSourceBootstrap.mockImplementation(() =>
      cachedHints
        ? { manifest: cachedHints.manifest, poster: result.frame }
        : null,
    );
    prewarmHarness.episodeSourceFromByteSource.mockImplementation(() => ({
      ...prewarmHarness.episodeSource,
      ...(cachedHints
        ? {
            manifestHint: cachedHints.manifest,
            playbackHint: cachedHints.timeline,
          }
        : {}),
    }));
    prewarmHarness.publishEpisodePreviewBootstrap.mockImplementation(() => {
      cachedHints = { manifest, timeline };
    });
    prewarmHarness.previewRead.mockResolvedValue(result);
    prewarmHarness.openEpisodePreviewSession.mockResolvedValue({
      dispose: prewarmHarness.previewDispose,
      read: prewarmHarness.previewRead,
    });
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);

    render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "current-with-hints" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );

    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.episodeSourceFromByteSource).toHaveBeenCalledTimes(2);
    expect(prewarmHarness.openEpisodePreviewSession).toHaveBeenCalledWith(
      expect.anything(),
      prewarmHarness.episodeSource,
      expect.anything(),
    );
    expect(prewarmHarness.prewarmEpisodeSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        manifestHint: manifest,
        playbackHint: timeline,
      }),
      expect.any(AbortSignal),
    );
  });

  it("does no speculative work before the current source is ready", async () => {
    render(
      <EpisodeSourceReadyProvider ready={false}>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "not-ready" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );

    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.openEpisodePreviewSession).not.toHaveBeenCalled();
    expect(prewarmHarness.prewarmEpisodeSource).not.toHaveBeenCalled();
  });

  it.each(["buffering", "isPlayPending"] as const)(
    "does no speculative work while playback is %s",
    async (gate) => {
      prewarmHarness[gate] = true;

      render(
        <EpisodeSourceReadyProvider ready>
          <AdjacentSamplePrewarm
            ctx={
              {
                dataset: { mediaType: "group" },
                media: { field: "mcap" },
                sample: { sample: { _id: `current-${gate}` } },
              } as never
            }
          />
        </EpisodeSourceReadyProvider>,
      );

      await act(async () => vi.runAllTimersAsync());

      expect(prewarmHarness.openEpisodePreviewSession).not.toHaveBeenCalled();
      expect(prewarmHarness.prewarmEpisodeSource).not.toHaveBeenCalled();
    },
  );

  it("backs off after foreground playback releases the link", async () => {
    prewarmHarness.buffering = true;
    prewarmHarness.peekSourceBootstrap.mockReturnValue({
      previewReadComplete: true,
    });
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);
    const ctx = {
      dataset: { mediaType: "group" },
      media: { field: "mcap" },
      sample: { sample: { _id: "foreground-gate" } },
    } as never;
    const view = render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm ctx={ctx} />
      </EpisodeSourceReadyProvider>,
    );

    prewarmHarness.buffering = false;
    view.rerender(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm ctx={ctx} />
      </EpisodeSourceReadyProvider>,
    );

    await act(async () => vi.advanceTimersByTimeAsync(4_999));
    expect(prewarmHarness.prewarmEpisodeSource).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(prewarmHarness.prewarmEpisodeSource).toHaveBeenCalledOnce();
  });

  it("recaptures an evicted poster without repeating the byte prewarm", async () => {
    const result = {
      bootstrapManifest: { streams: [] },
      frame: {
        image: {
          bytes: new Uint8Array([1, 2, 3]),
          kind: "encoded-image",
          mimeType: "image/jpeg",
        },
        kind: "image",
      },
      status: "ready",
      streamId: "/camera/front",
      streamSourceName: "/camera/front",
      streamSourceNames: ["/camera/front"],
    } as const;
    const cachedBootstrap = {
      manifest: result.bootstrapManifest,
      poster: result.frame,
    };
    prewarmHarness.peekSourceBootstrap.mockReturnValue(cachedBootstrap);
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);

    const first = render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "current-a" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());
    expect(prewarmHarness.prewarmEpisodeSource).toHaveBeenCalledOnce();
    expect(prewarmHarness.openEpisodePreviewSession).not.toHaveBeenCalled();

    first.unmount();
    prewarmHarness.peekSourceBootstrap
      .mockReset()
      .mockReturnValueOnce(null)
      .mockReturnValue(cachedBootstrap);
    prewarmHarness.previewRead.mockResolvedValue(result);
    prewarmHarness.openEpisodePreviewSession.mockResolvedValue({
      dispose: prewarmHarness.previewDispose,
      read: prewarmHarness.previewRead,
    });

    render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "current-b" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.publishEpisodePreviewBootstrap).toHaveBeenCalledWith(
      prewarmHarness.source,
      result,
    );
    expect(prewarmHarness.prewarmEpisodeSource).toHaveBeenCalledOnce();
  });

  it("does not repeat a completed posterless preview while its marker is cached", async () => {
    const result = {
      frame: null,
      status: "empty",
      streamId: null,
      streamSourceName: null,
      streamSourceNames: [],
    } as const;
    prewarmHarness.peekSourceBootstrap.mockReturnValue(null);
    prewarmHarness.publishEpisodePreviewBootstrap.mockImplementation(() => {
      prewarmHarness.peekSourceBootstrap.mockReturnValue({
        previewReadComplete: true,
      });
    });
    prewarmHarness.previewRead.mockResolvedValue(result);
    prewarmHarness.openEpisodePreviewSession.mockResolvedValue({
      dispose: prewarmHarness.previewDispose,
      read: prewarmHarness.previewRead,
    });
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);

    const first = render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "posterless-a" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());
    expect(prewarmHarness.openEpisodePreviewSession).toHaveBeenCalledOnce();

    first.unmount();
    prewarmHarness.peekSourceBootstrap.mockReturnValue({
      previewReadComplete: true,
    });
    render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "posterless-b" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.openEpisodePreviewSession).toHaveBeenCalledOnce();
  });

  it("does not repeatedly open an unsupported preview session", async () => {
    prewarmHarness.peekSourceBootstrap.mockReturnValue(null);
    prewarmHarness.publishSourceBootstrap.mockImplementation(() => {
      prewarmHarness.peekSourceBootstrap.mockReturnValue({
        previewReadComplete: true,
      });
    });
    prewarmHarness.openEpisodePreviewSession.mockResolvedValue(null);
    prewarmHarness.prewarmEpisodeSource.mockResolvedValue(true);

    const first = render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "unsupported-a" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.publishSourceBootstrap).toHaveBeenCalledWith(
      prewarmHarness.source,
      { previewReadComplete: true },
    );
    first.unmount();

    render(
      <EpisodeSourceReadyProvider ready>
        <AdjacentSamplePrewarm
          ctx={
            {
              dataset: { mediaType: "group" },
              media: { field: "mcap" },
              sample: { sample: { _id: "unsupported-b" } },
            } as never
          }
        />
      </EpisodeSourceReadyProvider>,
    );
    await act(async () => vi.runAllTimersAsync());

    expect(prewarmHarness.openEpisodePreviewSession).toHaveBeenCalledOnce();
  });
});
