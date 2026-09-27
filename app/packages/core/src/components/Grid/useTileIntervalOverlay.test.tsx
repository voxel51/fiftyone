import { act, renderHook } from "@testing-library/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({
  supportsTemporalTags: () => ({ key: "test_supportsTemporalTags" }),
  useCurrentDataset: () => ({ datasetId: "dataset" }),
}));

const tags = vi.hoisted(() => ({ supported: true }));

vi.mock("recoil", async () => ({
  ...(await vi.importActual<typeof import("recoil")>("recoil")),
  useRecoilBridgeAcrossReactRoots_UNSTABLE:
    () =>
    ({ children }: { children: ReactNode }) => <>{children}</>,
  useRecoilValue: () => tags.supported,
}));

const lane = vi.hoisted(() => ({ surfaces: [] as string[] }));

// What an edition registers, e.g. the embedding-window lane
const registered = vi.hoisted(() => ({
  overlays: [] as Array<(props: { ctx: { durationNs?: number } }) => null>,
  durations: [] as Array<number | undefined>,
}));

// The selection's first match for any tile, as a store a test can move
const match = vi.hoisted(() => {
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

vi.mock("@fiftyone/multimodal/extensions/timeline", () => ({
  mcapGridOverlayKey: () => 0,
  useMcapGridOverlays: () => registered.overlays,
  useSampleRendererFirstMatch: () => {
    const startNs = useSyncExternalStore(
      match.subscribe,
      () => match.state.startNs,
    );
    return startNs === null ? null : { startNs };
  },
}));

// A video tile's looker: a duration that lands with the poster, and a seek
vi.mock("@fiftyone/looker", () => {
  class VideoLooker extends EventTarget {
    duration: number | null = null;
    posterAt = vi.fn();
    loadPoster(duration: number) {
      this.duration = duration;
      this.dispatchEvent(new Event("load"));
    }
  }
  return { VideoLooker };
});

vi.mock("@fiftyone/multimodal/grid-overlay", () => ({
  EpisodeGridOverlay: ({ ctx }: { ctx: { surface: string } }) => {
    lane.surfaces.push(ctx.surface);
    return <div data-lane="" />;
  },
}));

import { VideoLooker } from "@fiftyone/looker";
import { useTileIntervalOverlay } from "./useTileIntervalOverlay";

type FakeLooker = VideoLooker & {
  posterAt: ReturnType<typeof vi.fn>;
  loadPoster: (duration: number) => void;
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

  it("mounts a registered overlay on the clip's duration where tags are unsupported", async () => {
    tags.supported = false;
    registered.durations = [];
    registered.overlays = [
      ({ ctx }) => {
        registered.durations.push(ctx.durationNs);
        return null;
      },
    ];
    lane.surfaces = [];
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

      expect(registered.durations).toEqual([2.5e9]);
      expect(lane.surfaces).toEqual([]);
    } finally {
      tags.supported = true;
      registered.overlays = [];
    }
  });

  describe("on a video with no recorded duration", () => {
    const mountWithLooker = async () => {
      // The mocked looker takes no arguments, unlike the real one
      const looker = new (VideoLooker as unknown as new () => FakeLooker)();
      registered.durations = [];
      registered.overlays = [
        ({ ctx }) => {
          registered.durations.push(ctx.durationNs);
          return null;
        },
      ];
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

    it("draws on the clip length the looker read with its poster", async () => {
      try {
        const looker = await mountWithLooker();

        await act(async () => looker.loadPoster(12));

        expect(registered.durations.at(0)).toBeUndefined();
        expect(registered.durations.at(-1)).toBe(12e9);
      } finally {
        registered.overlays = [];
      }
    });

    it("shows the first match once the poster is in, and the start once the match is gone", async () => {
      try {
        const looker = await mountWithLooker();

        // Before the poster there is nothing to seek
        await act(async () => match.set(3_000_000_000n));
        expect(looker.posterAt).not.toHaveBeenCalled();

        await act(async () => looker.loadPoster(12));
        expect(looker.posterAt).toHaveBeenLastCalledWith(3);

        await act(async () => match.set(null));
        expect(looker.posterAt).toHaveBeenLastCalledWith(null);
      } finally {
        match.set(null);
        registered.overlays = [];
      }
    });
  });
});
