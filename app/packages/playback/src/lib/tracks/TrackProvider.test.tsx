import { act, cleanup, render, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TrackProvider,
  useTrackContext,
  useTrackPinning,
  usePinnedTracks,
  useTracks,
  type Track,
} from "./TrackProvider";

const TRACKS: Track[] = [
  { id: "cat", label: "Cat", color: "#abc", events: [] },
  { id: "dog", label: "Dog", color: "#def", events: [] },
  { id: "person", label: "Person", color: "#123", events: [] },
];

const wrap =
  (tracks: Track[] = TRACKS, initialPinnedIds: string[] = []) =>
  ({ children }: { children: React.ReactNode }) => (
    <TrackProvider tracks={tracks} initialPinnedIds={initialPinnedIds}>
      {children}
    </TrackProvider>
  );

describe("TrackProvider", () => {
  afterEach(() => cleanup());

  it("throws when consumed outside a provider", () => {
    expect(() => renderHook(() => useTrackContext())).toThrow(
      /must be used inside <TrackProvider>/,
    );
  });

  it("returns the seeded tracks via useTracks", () => {
    const { result } = renderHook(() => useTracks(), { wrapper: wrap() });
    expect(result.current.map((t) => t.id)).toEqual(["cat", "dog", "person"]);
  });

  it("returns an empty array from useTracks when nothing is seeded", () => {
    const { result } = renderHook(() => useTracks(), { wrapper: wrap([]) });
    expect(result.current).toEqual([]);
  });

  it("filters usePinnedTracks by the current pinned ids", () => {
    const { result } = renderHook(() => usePinnedTracks(), {
      wrapper: wrap(TRACKS, ["dog"]),
    });
    expect(result.current.map((t) => t.id)).toEqual(["dog"]);
  });

  describe("useTrackPinning", () => {
    it("starts with the seeded pinned ids", () => {
      const { result } = renderHook(() => useTrackPinning(), {
        wrapper: wrap(TRACKS, ["cat", "person"]),
      });
      expect(Array.from(result.current.pinnedIds).sort()).toEqual([
        "cat",
        "person",
      ]);
    });

    it("togglePin flips a track between pinned and unpinned", () => {
      const { result } = renderHook(
        () => ({ pinning: useTrackPinning(), pinned: usePinnedTracks() }),
        { wrapper: wrap(TRACKS, []) },
      );
      expect(result.current.pinned.map((t) => t.id)).toEqual([]);
      act(() => result.current.pinning.togglePin("dog"));
      expect(result.current.pinned.map((t) => t.id)).toEqual(["dog"]);
      act(() => result.current.pinning.togglePin("dog"));
      expect(result.current.pinned.map((t) => t.id)).toEqual([]);
    });

    it("setPinned imperatively sets a single track's pin state", () => {
      const { result } = renderHook(
        () => ({ pinning: useTrackPinning(), pinned: usePinnedTracks() }),
        { wrapper: wrap(TRACKS, ["cat"]) },
      );
      act(() => result.current.pinning.setPinned("dog", true));
      expect(result.current.pinned.map((t) => t.id).sort()).toEqual([
        "cat",
        "dog",
      ]);
      act(() => result.current.pinning.setPinned("cat", false));
      expect(result.current.pinned.map((t) => t.id)).toEqual(["dog"]);
    });

    it("setPinned is a no-op when the requested state matches the current one", () => {
      const { result } = renderHook(
        () => ({ pinning: useTrackPinning(), pinned: usePinnedTracks() }),
        { wrapper: wrap(TRACKS, ["cat"]) },
      );
      act(() => result.current.pinning.setPinned("cat", true));
      expect(result.current.pinned.map((t) => t.id)).toEqual(["cat"]);
    });
  });

  describe("autoPinNewTracks", () => {
    // Probe that mirrors the latest pinning context out for assertion.
    const renderWithTracks = (autoPinNewTracks: boolean, initial: Track[]) => {
      const captured: { pinnedIds: ReadonlySet<string> } = {
        pinnedIds: new Set(),
      };
      const Probe = () => {
        captured.pinnedIds = useTrackPinning().pinnedIds;
        return null;
      };
      const ui = (tracks: Track[]) => (
        <TrackProvider tracks={tracks} autoPinNewTracks={autoPinNewTracks}>
          <Probe />
        </TrackProvider>
      );
      const { rerender } = render(ui(initial));
      return { captured, addAll: () => rerender(ui(TRACKS)) };
    };

    it("default: a track that appears after hydration is auto-pinned", () => {
      const { captured, addAll } = renderWithTracks(true, [TRACKS[0]]);
      expect(Array.from(captured.pinnedIds)).toEqual([]);
      act(() => addAll());
      // cat was present at hydration (seen, not pinned); dog + person are new.
      expect(Array.from(captured.pinnedIds).sort()).toEqual(["dog", "person"]);
    });

    it("false: a track that appears after hydration is NOT pinned", () => {
      const { captured, addAll } = renderWithTracks(false, [TRACKS[0]]);
      expect(Array.from(captured.pinnedIds)).toEqual([]);
      act(() => addAll());
      expect(Array.from(captured.pinnedIds)).toEqual([]);
    });
  });

  describe("persistKey", () => {
    const KEY = "fo-va-pinned-tracks:ds:sample-1";

    afterEach(() => window.localStorage.clear());

    const persistWrap =
      (persistKey?: string, initialPinnedIds: string[] = []) =>
      ({ children }: { children: React.ReactNode }) => (
        <TrackProvider
          tracks={TRACKS}
          initialPinnedIds={initialPinnedIds}
          persistKey={persistKey}
        >
          {children}
        </TrackProvider>
      );

    it("hydrates the initial pin state from storage", () => {
      window.localStorage.setItem(KEY, JSON.stringify(["dog", "person"]));
      const { result } = renderHook(() => usePinnedTracks(), {
        wrapper: persistWrap(KEY),
      });
      expect(result.current.map((t) => t.id).sort()).toEqual(["dog", "person"]);
    });

    it("falls back to initialPinnedIds when storage is empty", () => {
      const { result } = renderHook(() => usePinnedTracks(), {
        wrapper: persistWrap(KEY, ["cat"]),
      });
      expect(result.current.map((t) => t.id)).toEqual(["cat"]);
    });

    it("stored pins win over initialPinnedIds", () => {
      window.localStorage.setItem(KEY, JSON.stringify(["dog"]));
      const { result } = renderHook(() => usePinnedTracks(), {
        wrapper: persistWrap(KEY, ["cat"]),
      });
      expect(result.current.map((t) => t.id)).toEqual(["dog"]);
    });

    it("writes pin changes back to storage", () => {
      const { result } = renderHook(() => useTrackPinning(), {
        wrapper: persistWrap(KEY),
      });
      act(() => result.current.togglePin("dog"));
      expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["dog"]);
      act(() => result.current.togglePin("cat"));
      expect(JSON.parse(window.localStorage.getItem(KEY)!).sort()).toEqual([
        "cat",
        "dog",
      ]);
      act(() => result.current.togglePin("dog"));
      expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["cat"]);
    });

    it("leaves storage untouched when no persistKey is given", () => {
      const { result } = renderHook(() => useTrackPinning(), {
        wrapper: persistWrap(undefined),
      });
      act(() => result.current.togglePin("dog"));
      expect(window.localStorage.getItem(KEY)).toBeNull();
      expect(window.localStorage.length).toBe(0);
    });

    it("ignores malformed stored values and uses initialPinnedIds", () => {
      window.localStorage.setItem(KEY, "not json");
      const { result } = renderHook(() => usePinnedTracks(), {
        wrapper: persistWrap(KEY, ["person"]),
      });
      expect(result.current.map((t) => t.id)).toEqual(["person"]);
    });
  });
});
