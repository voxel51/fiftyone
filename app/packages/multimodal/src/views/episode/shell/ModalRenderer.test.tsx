import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  intervalTrackId,
  registerEpisodeIntervalSource,
} from "../../../extensions/episode-intervals";
import ModalRenderer from "./ModalRenderer";

const rendererHarness = vi.hoisted(() => ({
  openEpisodePreviewSession: vi.fn(),
  peek: vi.fn(),
  prewarmEpisodeSource: vi.fn(),
  publishEpisodeTimeRange: vi.fn(),
  timeRange: null as { endNs: bigint; startNs: bigint } | null,
  // Captured rather than discarded: these two props are the whole route from
  // the registered interval sources to the modal timeline. A mock that drops
  // them leaves the spreads that produce them unpinned.
  builtInSections: undefined as readonly { id: string }[] | undefined,
  defaultPinnedTrackIds: undefined as readonly string[] | undefined,
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
    builtInSections,
    children,
  }: {
    builtInSections?: readonly { id: string }[];
    children: (value: {
      decorateTrack: undefined;
      onDrawerOpenChange: undefined;
      preferences: { drawerMaxSize: undefined };
      runtime: null;
      tracks: [];
    }) => ReactNode;
  }) => {
    rendererHarness.builtInSections = builtInSections;
    return children({
      decorateTrack: undefined,
      onDrawerOpenChange: undefined,
      preferences: { drawerMaxSize: undefined },
      runtime: null,
      tracks: [],
    });
  },
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
  publishEpisodeTimeRange: rendererHarness.publishEpisodeTimeRange,
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
  useTimeRange: () => rendererHarness.timeRange,
}));

vi.mock("./SourcePlayback", () => ({
  SourcePlayback: ({
    children,
    defaultPinnedTrackIds,
  }: {
    children?: ReactNode;
    defaultPinnedTrackIds?: readonly string[];
  }) => {
    rendererHarness.defaultPinnedTrackIds = defaultPinnedTrackIds;
    return children;
  },
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
    rendererHarness.publishEpisodeTimeRange.mockReset();
    rendererHarness.timeRange = null;
    rendererHarness.builtInSections = undefined;
    rendererHarness.defaultPinnedTrackIds = undefined;
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

  it("publishes the episode time range under the id its consumers read", async () => {
    rendererHarness.timeRange = { endNs: 30n, startNs: 10n };

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

    // `sample._id` is the key `useEpisodeTimeRange` is called with, in the grid
    // overlay and in every interval source. A source that cannot find its
    // episode's axis contributes nothing, so this key has to match theirs.
    expect(rendererHarness.publishEpisodeTimeRange).toHaveBeenCalledWith(
      "current",
      { endNs: 30n, startNs: 10n },
    );
  });

  it("publishes no range before the session resolves one", async () => {
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

    expect(rendererHarness.publishEpisodeTimeRange).not.toHaveBeenCalled();
  });
});

// A registered source reaches the modal timeline through exactly two spreads
// in `ModalRenderer`. Both are invisible to the rest of the suite: drop either
// and every Enterprise section or auto-pin silently stops arriving.
describe("ModalRenderer interval sources", () => {
  const ctx = {
    dataset: { datasetId: "dataset", mediaType: "group" },
    media: { field: "mcap", path: "current.mcap" },
    sample: { sample: { _id: "current" } },
  } as never;

  let unregister: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    rendererHarness.builtInSections = undefined;
    rendererHarness.defaultPinnedTrackIds = undefined;
    unregister = registerEpisodeIntervalSource({
      Component: ({ children }) => (
        <>
          {children({
            intervals: [
              {
                color: "#fff",
                endNs: 2,
                eventName: "grasp",
                sourceId: "test:events",
                startNs: 1,
              },
            ],
            pinnedEventNames: ["grasp"],
          })}
        </>
      ),
      id: "test:events",
      label: "Test events",
      order: 300,
    });
  });

  afterEach(() => {
    unregister?.();
    unregister = null;
    cleanup();
    vi.useRealTimers();
  });

  it("gives the timeline host a section for each registered source", async () => {
    render(<ModalRenderer ctx={ctx} />);
    await act(async () => vi.runAllTimersAsync());

    expect(rendererHarness.builtInSections?.map((s) => s.id)).toContain(
      "test:events",
    );
  });

  it("pins the tracks a source reports as filtered for", async () => {
    render(<ModalRenderer ctx={ctx} />);
    await act(async () => vi.runAllTimersAsync());

    expect(rendererHarness.defaultPinnedTrackIds).toContain(
      intervalTrackId("test:events", "grasp"),
    );
  });
});
