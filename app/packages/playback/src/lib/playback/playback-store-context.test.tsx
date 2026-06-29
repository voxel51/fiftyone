import { cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "./PlaybackProvider";
import {
  PlaybackStoreContext,
  usePlaybackStore,
} from "./playback-store-context";

describe("usePlaybackStore", () => {
  afterEach(() => cleanup());

  it("throws when called outside a PlaybackProvider", () => {
    // Suppress the expected React error boundary noise in test output.
    const consoleError = console.error;
    console.error = () => {};

    expect(() => renderHook(() => usePlaybackStore())).toThrow(
      "usePlaybackStore must be used inside a <PlaybackProvider>",
    );

    console.error = consoleError;
  });

  it("returns the store when called inside a PlaybackProvider", () => {
    const { result } = renderHook(() => usePlaybackStore(), {
      wrapper: ({ children }) => (
        <PlaybackProvider duration={5} stepInterval={1 / 30}>
          {children}
        </PlaybackProvider>
      ),
    });

    expect(result.current).toBeDefined();
    // A Jotai store has get/set/sub methods
    expect(typeof result.current.get).toBe("function");
    expect(typeof result.current.set).toBe("function");
    expect(typeof result.current.sub).toBe("function");
  });

  it("returns null from context when the context is unset (raw context read)", () => {
    const { result } = renderHook(() => React.useContext(PlaybackStoreContext));
    expect(result.current).toBeNull();
  });
});
