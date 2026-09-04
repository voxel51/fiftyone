// @vitest-environment jsdom

/**
 * The pause handle exists for callers OUTSIDE a PlaybackProvider — the modal's
 * action bar is a sibling of the media container, not a descendant.
 */

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePublishPauseHandle, useRequestPlaybackPause } from "./pause-handle";

afterEach(() => cleanup());

/** Stands in for a PlaybackProvider publishing its `pause`. */
function Publisher({ pause }: { pause: () => void }) {
  usePublishPauseHandle(pause);
  return null;
}

describe("playback pause handle", () => {
  it("is a no-op when no timeline is mounted", () => {
    const { result } = renderHook(() => useRequestPlaybackPause());
    // Image samples mount no timeline, so callers must not need a guard.
    expect(() => result.current()).not.toThrow();
  });

  it("pauses the mounted timeline", () => {
    const pause = vi.fn();
    render(<Publisher pause={pause} />);

    const { result } = renderHook(() => useRequestPlaybackPause());
    act(() => result.current());

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("stores the function rather than invoking it as a reducer", () => {
    // jotai treats a bare function value as an updater, so publishing without
    // the updater wrapper would call pause() at publish time and store its
    // return. Mounting alone must not pause anything.
    const pause = vi.fn();
    render(<Publisher pause={pause} />);

    expect(pause).not.toHaveBeenCalled();
  });

  it("clears the handle on unmount", () => {
    const pause = vi.fn();
    const view = render(<Publisher pause={pause} />);
    view.unmount();

    const { result } = renderHook(() => useRequestPlaybackPause());
    act(() => result.current());

    expect(pause).not.toHaveBeenCalled();
  });

  it("survives a JotaiProvider mounted between publisher and consumer", () => {
    // Publisher and consumer live in different subtrees by construction, so
    // "nearest provider wins" would route the write and the read to separate
    // stores and the pause would silently no-op. Both sides therefore target
    // the default store explicitly. PlaybackProvider documents this exact
    // hazard (a nested provider from another package shadowing its store).
    const pause = vi.fn();
    render(
      <Provider store={createStore()}>
        <Publisher pause={pause} />
      </Provider>,
    );

    const { result } = renderHook(() => useRequestPlaybackPause(), {
      wrapper: ({ children }) => (
        <Provider store={createStore()}>{children}</Provider>
      ),
    });
    act(() => result.current());

    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("a provider swap does not blank out its replacement's handle", () => {
    // Explore and Annotate swap rather than coexist; the outgoing unmount must
    // not clear the incoming publish.
    const first = vi.fn();
    const second = vi.fn();

    const view = render(<Publisher pause={first} />);
    view.rerender(<Publisher pause={second} />);

    const { result } = renderHook(() => useRequestPlaybackPause());
    act(() => result.current());

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
