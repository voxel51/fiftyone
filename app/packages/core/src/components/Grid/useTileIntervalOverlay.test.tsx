import { act, renderHook } from "@testing-library/react";
import {
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({
  supportsTemporalTags: () => ({ key: "test_supportsTemporalTags" }),
  useCurrentDataset: () => ({ datasetId: "dataset" }),
}));

const tags = vi.hoisted(() => ({ supported: true }));

vi.mock("@fiftyone/reverb", async () => ({
  ...(await vi.importActual<typeof import("@fiftyone/reverb")>(
    "@fiftyone/reverb",
  )),
  useReverbBridge:
    () =>
    ({ children }: { children: ReactNode }) => <>{children}</>,
  useReverbValue: () => tags.supported,
}));

const lane = vi.hoisted(() => ({ surfaces: [] as string[] }));

const registered = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    overlays: [] as Array<ComponentType>,
    register(overlays: Array<ComponentType>) {
      this.overlays = overlays;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const ranges = vi.hoisted(
  () => new Map<string, { startNs: bigint; endNs: bigint }>(),
);

const playheads = vi.hoisted(() => new Map<string, bigint>());

const focus = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { startNs: null as bigint | null };
  return {
    state,
    set(startNs: bigint | null) {
      state.startNs = startNs;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const seeks = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const requests = new Map<string, { timestampNs: bigint }>();
  return {
    request(episodeId: string, timestampNs: bigint) {
      requests.set(episodeId, { timestampNs });
      listeners.get(episodeId)?.forEach((listener) => listener());
    },
    get: (episodeId: string) => requests.get(episodeId) ?? null,
    release: (episodeId: string) => requests.delete(episodeId),
    subscribe(episodeId: string, listener: () => void) {
      const set = listeners.get(episodeId) ?? new Set();
      set.add(listener);
      listeners.set(episodeId, set);
      return () => set.delete(listener);
    },
  };
});

vi.mock("@fiftyone/multimodal/extensions/timeline", () => ({
  useSampleFocus: () => {
    const startNs = useSyncExternalStore(
      focus.subscribe,
      () => focus.state.startNs,
    );
    return startNs === null ? null : { startNs };
  },
}));

vi.mock("@fiftyone/looker", () => {
  class VideoLooker extends EventTarget {
    duration: number | null = null;
    posterAt = vi.fn();
    seekToSeconds = vi.fn();
    present(playing: boolean, timeSeconds: number) {
      this.dispatchEvent(
        new CustomEvent("frame", { detail: { playing, timeSeconds } }),
      );
    }
    loadPoster(duration: number) {
      this.duration = duration;
      this.dispatchEvent(new Event("load"));
    }
  }
  return { VideoLooker };
});

vi.mock("./TileLanes", () => ({
  TileLanes: ({
    ctx,
    showTags,
  }: {
    ctx: { surface: string };
    showTags: boolean;
  }) => {
    const overlays = useSyncExternalStore(
      registered.subscribe,
      () => registered.overlays,
    );
    if (showTags) lane.surfaces.push(ctx.surface);
    return (
      <>
        {showTags ? <div data-lane="" /> : null}
        {overlays.map((Overlay, index) => (
          <Overlay key={index} />
        ))}
      </>
    );
  },
}));

vi.mock("@fiftyone/multimodal/runtime", () => ({
  getEpisodeSeek: seeks.get,
  releaseEpisodeSeek: seeks.release,
  subscribeEpisodeSeek: seeks.subscribe,
  publishEpisodePlayhead: (episodeId: string, timestampNs: bigint) =>
    playheads.set(episodeId, timestampNs),
  releaseEpisodePlayhead: (episodeId: string) => playheads.delete(episodeId),
  publishEpisodeTimeRange: (
    episodeId: string,
    range: { startNs: bigint; endNs: bigint },
  ) => ranges.set(episodeId, range),
}));

import { VideoLooker } from "@fiftyone/looker";
import { useTileIntervalOverlay } from "./useTileIntervalOverlay";

type FakeLooker = VideoLooker & {
  posterAt: ReturnType<typeof vi.fn>;
  seekToSeconds: ReturnType<typeof vi.fn>;
  loadPoster: (duration: number) => void;
  present: (playing: boolean, timeSeconds: number) => void;
};

describe("useTileIntervalOverlay", () => {
  it("mounts a lane on a video tile and not on an image tile", async () => {
    const { result } = renderHook(() => useTileIntervalOverlay());
    const show = async (mediaType: string) => {
      const element = document.createElement("div");
      await act(async () =>
        result.current.mount(mediaType, element, {
          sample: { _id: mediaType, _media_type: mediaType },
        }),
      );
      return element.querySelector("[data-lane]") !== null;
    };

    expect(await show("video")).toBe(true);
    expect(await show("image")).toBe(false);
  });

  it("tells the lane it is drawn on a grid tile", async () => {
    lane.surfaces = [];
    const { result } = renderHook(() => useTileIntervalOverlay());
    await act(async () =>
      result.current.mount("video", document.createElement("div"), {
        sample: { _id: "video", _media_type: "video" },
      }),
    );

    expect(lane.surfaces).toEqual(["grid"]);
  });

  it("mounts a registered overlay where tags are unsupported, on the clip's recorded duration", async () => {
    tags.supported = false;
    const mounted: string[] = [];
    registered.overlays = [
      () => {
        mounted.push("overlay");
        return null;
      },
    ];
    lane.surfaces = [];
    ranges.clear();
    try {
      const { result } = renderHook(() => useTileIntervalOverlay());
      await act(async () =>
        result.current.mount("video", document.createElement("div"), {
          sample: {
            _id: "video",
            _media_type: "video",
            metadata: { duration: 2.5 },
          },
        }),
      );

      expect(mounted.length).toBeGreaterThan(0);
      expect(lane.surfaces).toEqual([]);
      expect(ranges.get("video")).toEqual({
        startNs: 0n,
        endNs: 2_500_000_000n,
      });
    } finally {
      tags.supported = true;
      registered.overlays = [];
    }
  });

  it("draws an overlay registered after the tile mounted where tags are unsupported", async () => {
    tags.supported = false;
    const element = document.createElement("div");
    try {
      const { result } = renderHook(() => useTileIntervalOverlay());
      await act(async () =>
        result.current.mount("video", element, {
          sample: { _id: "video", _media_type: "video" },
        }),
      );
      await act(async () => registered.register([() => <i data-overlay="" />]));

      expect(element.querySelector("[data-overlay]")).not.toBeNull();
    } finally {
      tags.supported = true;
      registered.register([]);
    }
  });

  describe("on a video with no recorded duration", () => {
    const mountWithLooker = async () => {
      const looker = new (VideoLooker as unknown as new () => FakeLooker)();
      ranges.clear();
      const { result } = renderHook(() => useTileIntervalOverlay());
      await act(async () =>
        result.current.mount(
          "video",
          document.createElement("div"),
          { sample: { _id: "video", _media_type: "video" } },
          looker,
        ),
      );
      return looker;
    };

    it("moves the clip to where its lanes are clicked", async () => {
      const looker = await mountWithLooker();

      await act(async () => seeks.request("video", 4_500_000_000n));

      expect(looker.seekToSeconds).toHaveBeenLastCalledWith(4.5);
    });

    it("marks the lanes where hover playback is, and withdraws the mark when it stops", async () => {
      const looker = await mountWithLooker();

      await act(async () => looker.present(true, 1.25));
      expect(playheads.get("video")).toBe(1_250_000_000n);

      await act(async () => looker.present(false, 0.5));
      expect(playheads.has("video")).toBe(false);
    });

    it("publishes the clip length the looker read with its poster, shows the published focus once the poster is in, and the start once the focus is cleared", async () => {
      try {
        const looker = await mountWithLooker();

        await act(async () => focus.set(3_000_000_000n));
        expect(ranges.has("video")).toBe(false);
        expect(looker.posterAt).not.toHaveBeenCalled();

        await act(async () => looker.loadPoster(12));
        expect(ranges.get("video")).toEqual({
          startNs: 0n,
          endNs: 12_000_000_000n,
        });
        expect(looker.posterAt).toHaveBeenLastCalledWith(3);

        await act(async () => focus.set(null));
        expect(looker.posterAt).toHaveBeenLastCalledWith(null);
      } finally {
        focus.set(null);
      }
    });
  });
});
