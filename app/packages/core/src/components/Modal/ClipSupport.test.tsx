/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * `ClipSupportRange` against a REAL `PlaybackProvider`: the loop and view
 * windows it sets, the one-shot playhead seed, and the lock toggle's effect
 * on a playhead inside versus outside the support. Only the keybinding
 * registration is mocked, to capture the `l` handler.
 */

import {
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  PlaybackProvider,
  usePlayback,
  usePlaybackStore,
  useViewEnd,
  useViewStart,
} from "@fiftyone/playback";
import { act, render, renderHook } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClipSupportRange,
  supportToSeconds,
  useClipSupport,
} from "./ClipSupport";

interface CapturedBinding {
  commandId: string;
  sequence: string;
  handler: () => void;
  enablement?: () => boolean;
}

let bindings: CapturedBinding[] = [];

vi.mock("@fiftyone/commands", () => ({
  KnownContexts: { Modal: "modal" },
  useKeyBindings: (_context: string, list: CapturedBinding[]) => {
    bindings = list;
  },
}));

const FPS = 10;
const DURATION = 4;
const SUPPORT: readonly [number, number] = [11, 20];
// frame 11 starts at 1.0s, frame 20 ends at 2.0s
const RANGE = supportToSeconds(SUPPORT, FPS);

const lockBinding = () => {
  const found = bindings.find(
    (b) => b.commandId === "video-explore-support-lock",
  );
  if (!found) throw new Error("support lock binding not registered");
  return found;
};

const renderRange = (
  support: readonly [number, number] | null,
  duration = DURATION,
) =>
  renderHook(
    () => {
      const store = usePlaybackStore();
      return {
        store,
        api: usePlayback(),
        clip: useClipSupport(),
        viewStart: useViewStart(),
        viewEnd: useViewEnd(),
      };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider
          duration={duration}
          mode={{ kind: "sequence", fps: FPS }}
        >
          <ClipSupportRange support={support} frameRate={FPS}>
            {children}
          </ClipSupportRange>
        </PlaybackProvider>
      ),
    },
  );

describe("supportToSeconds", () => {
  it("spans the first frame's start to the last frame's end", () => {
    expect(supportToSeconds([1, 1], 10)).toEqual({ start: 0, end: 0.1 });
    expect(supportToSeconds([11, 20], 10)).toEqual({ start: 1, end: 2 });
  });
});

describe("ClipSupportRange", () => {
  beforeEach(() => {
    bindings = [];
  });

  it("locks the loop and view to the support and seeds the playhead", () => {
    const { result } = renderRange(SUPPORT);
    const { store } = result.current;

    expect(getLoopStart(store)).toBeCloseTo(RANGE.start);
    expect(getLoopEnd(store)).toBeCloseTo(RANGE.end);
    expect(result.current.viewStart).toBeCloseTo(RANGE.start);
    expect(result.current.viewEnd).toBeCloseTo(RANGE.end);
    expect(getPlayhead(store)).toBeCloseTo(RANGE.start);
    expect(result.current.clip).toMatchObject({
      support: SUPPORT,
      locked: true,
    });
  });

  it("leaves the engine alone when the sample has no support", () => {
    const { result } = renderRange(null);
    const { store } = result.current;

    expect(getLoopStart(store)).toBe(0);
    expect(getLoopEnd(store)).toBe(DURATION);
    expect(result.current.viewEnd).toBe(DURATION);
    expect(getPlayhead(store)).toBe(0);
    expect(result.current.clip.support).toBeNull();
    expect(lockBinding().enablement?.()).toBe(false);
  });

  it("unlock restores the full timeline; re-lock returns a wandered playhead", () => {
    const { result } = renderRange(SUPPORT);
    const { store } = result.current;

    act(() => lockBinding().handler());
    expect(result.current.clip.locked).toBe(false);
    expect(getLoopStart(store)).toBe(0);
    expect(getLoopEnd(store)).toBe(DURATION);
    expect(result.current.viewStart).toBe(0);
    expect(result.current.viewEnd).toBe(DURATION);

    // Outside the support while unlocked, then lock: back to the first frame.
    act(() => result.current.api.seek(3.5));
    act(() => result.current.clip.toggleLock());
    expect(result.current.clip.locked).toBe(true);
    expect(getLoopEnd(store)).toBeCloseTo(RANGE.end);
    expect(getPlayhead(store)).toBeCloseTo(RANGE.start);

    // Inside the support while unlocked, then lock: the playhead stays put.
    act(() => result.current.clip.toggleLock());
    act(() => result.current.api.seek(1.5));
    act(() => result.current.clip.toggleLock());
    expect(getPlayhead(store)).toBeCloseTo(1.5);
  });

  it("waits for the duration to land before applying the support", () => {
    const { result } = renderRange(SUPPORT, 0);
    const { store } = result.current;

    // Nothing to clamp against yet: the engine rejects every range.
    expect(getLoopEnd(store)).toBe(0);
    expect(getPlayhead(store)).toBe(0);

    act(() => {
      result.current.api.registerStream({
        id: "video",
        blocking: true,
        duration: DURATION,
        bufferState: () => "ready",
      });
    });

    expect(getLoopStart(store)).toBeCloseTo(RANGE.start);
    expect(getLoopEnd(store)).toBeCloseTo(RANGE.end);
    expect(getPlayhead(store)).toBeCloseTo(RANGE.start);
  });

  it("exposes no support through the context without a frame rate", () => {
    const Probe: React.FC = () => {
      const { support, locked } = useClipSupport();
      return <div data-testid="probe">{`${support}|${locked}`}</div>;
    };
    const { getByTestId } = render(
      <PlaybackProvider duration={DURATION}>
        <ClipSupportRange support={SUPPORT} frameRate={undefined}>
          <Probe />
        </ClipSupportRange>
      </PlaybackProvider>,
    );
    expect(getByTestId("probe").textContent).toBe("null|false");
  });
});
