import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModalRenderer from "./ModalRenderer";

const rendererHarness = vi.hoisted(() => ({
  openEpisodePreviewSession: vi.fn(),
  peek: vi.fn(),
  prewarmEpisodeSource: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    // Exercise any current-source-ready consumers mounted by ModalRenderer.
    useContext: () => true,
  };
});

vi.mock("@fiftyone/playback/runtime", () => ({
  getIsBuffering: () => false,
  getIsPlayPending: () => false,
  useIsBuffering: () => false,
  useIsPlayPending: () => false,
  usePlaybackStore: () => ({ get: () => ({ limited: false }) }),
}));

vi.mock("@fiftyone/state", () => ({
  modalNavigation: {
    get: () => ({ peek: rendererHarness.peek }),
  },
}));

vi.mock("../../../extensions/timeline", () => ({
  AnnotationStreamsProvider: ({ children }: { children: ReactNode }) =>
    children,
  TimelineExtensionHost: ({
    children,
  }: {
    children: (value: {
      decorateTrack: undefined;
      onDrawerOpenChange: undefined;
      preferences: { drawerMaxSize: undefined };
      runtime: null;
      tracks: [];
    }) => ReactNode;
  }) =>
    children({
      decorateTrack: undefined,
      onDrawerOpenChange: undefined,
      preferences: { drawerMaxSize: undefined },
      runtime: null,
      tracks: [],
    }),
  useSampleRendererFirstMatch: () => null,
}));

vi.mock("../../../runtime", () => ({
  episodeSourceAccessKey: () => "neighbor",
  openEpisodePreviewSession: rendererHarness.openEpisodePreviewSession,
  peekSourceBootstrap: () => null,
  // Sentinel for the deleted entry point so restoring the old worker makes
  // the no-network assertions below fail at every speculative stage.
  prewarmEpisodeSource: rendererHarness.prewarmEpisodeSource,
  publishEpisodePreviewBootstrap: vi.fn(),
  publishSourceBootstrap: vi.fn(),
}));

vi.mock("../../session/episode-source", () => ({
  episodeByteSourceFromSample: () => ({
    sourceId: "neighbor",
    url: "memory://neighbor.mcap",
  }),
  episodeSourceFromByteSource: () => ({ episodeId: "neighbor" }),
  sampleDescriptorFromContext: () => ({
    mediaType: "group",
    path: "current.mcap",
  }),
  sampleDescriptorFromSample: () => ({
    mediaType: "group",
    path: "neighbor.mcap",
  }),
}));

vi.mock("../../session/use-episode-session", () => ({
  useEpisodeSession: () => ({ error: null, session: {} }),
}));

vi.mock("../../session/use-stable-episode-source", () => ({
  useStableEpisodeSource: () => ({
    byteSource: { sourceId: "current", url: "memory://current.mcap" },
    episodeSource: { episodeId: "current" },
  }),
}));

vi.mock("../playback/network-health", () => ({
  getNetworkHealth: () => ({ limited: false }),
}));

vi.mock("../playback/use-temporal-tags", () => ({
  useFilteredTemporalTagPinnedIds: () => [],
  useTemporalTags: () => ({
    onTagCreate: undefined,
    onTagDelete: undefined,
    onTagUpdate: undefined,
    tracks: [],
  }),
}));

vi.mock("../playback/use-time-range", () => ({
  useTimeRange: () => null,
}));

vi.mock("./SourcePlayback", () => ({
  SourcePlayback: ({ children }: { children?: ReactNode }) => children,
}));

describe("ModalRenderer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      callback();
      return 1;
    });
    rendererHarness.openEpisodePreviewSession.mockReset();
    rendererHarness.openEpisodePreviewSession.mockResolvedValue(null);
    rendererHarness.peek.mockReset();
    rendererHarness.peek.mockResolvedValue({ sample: { _id: "neighbor" } });
    rendererHarness.prewarmEpisodeSource.mockReset();
    rendererHarness.prewarmEpisodeSource.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not request a neighboring sample when the current source becomes ready", async () => {
    render(
      <ModalRenderer
        ctx={
          {
            dataset: { datasetId: "dataset", mediaType: "group" },
            media: { field: "mcap", path: "current.mcap" },
            sample: { sample: { _id: "current" } },
          } as never
        }
      />,
    );

    await act(async () => vi.runAllTimersAsync());

    expect(rendererHarness.peek).not.toHaveBeenCalled();
    expect(rendererHarness.openEpisodePreviewSession).not.toHaveBeenCalled();
    expect(rendererHarness.prewarmEpisodeSource).not.toHaveBeenCalled();
  });
});
