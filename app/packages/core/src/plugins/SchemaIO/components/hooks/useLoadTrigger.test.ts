/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useLoadTrigger, type LoaderState } from "./useLoadTrigger";

describe("useLoadTrigger", () => {
  describe("first load behavior", () => {
    it("shouldLoad is true on first render when idle", () => {
      const { result } = renderHook(() => useLoadTrigger("idle", null));
      expect(result.current.shouldLoad).toBe(true);
    });

    it("shouldLoad is true on first render when loaded", () => {
      const { result } = renderHook(() => useLoadTrigger("loaded", null));
      expect(result.current.shouldLoad).toBe(true);
    });

    it("shouldLoad is true on first render when errored", () => {
      const { result } = renderHook(() => useLoadTrigger("errored", null));
      expect(result.current.shouldLoad).toBe(true);
    });

    it("shouldLoad is false when currently loading", () => {
      const { result } = renderHook(() => useLoadTrigger("loading", null));
      expect(result.current.shouldLoad).toBe(false);
    });
  });

  describe("after markLoaded called (no dependencies)", () => {
    it("shouldLoad is false without dependencies", () => {
      const { result, rerender } = renderHook(
        ({ state }) => useLoadTrigger(state, null),
        { initialProps: { state: "idle" as LoaderState } }
      );

      expect(result.current.shouldLoad).toBe(true);

      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState });

      expect(result.current.shouldLoad).toBe(false);
    });

    it("shouldLoad stays false on subsequent rerenders", () => {
      const { result, rerender } = renderHook(
        ({ state }) => useLoadTrigger(state, null),
        { initialProps: { state: "idle" as LoaderState } }
      );

      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState });
      rerender({ state: "loaded" as LoaderState });
      rerender({ state: "loaded" as LoaderState });

      expect(result.current.shouldLoad).toBe(false);
    });
  });

  describe("with dependencies", () => {
    it("shouldLoad is false when dependencies unchanged", () => {
      const hash = JSON.stringify(["Toyota"]);
      const { result, rerender } = renderHook(
        ({ state, hash }) => useLoadTrigger(state, hash),
        { initialProps: { state: "idle" as LoaderState, hash } }
      );

      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState, hash });

      expect(result.current.shouldLoad).toBe(false);
    });

    it("shouldLoad is true when dependencies change", () => {
      const { result, rerender } = renderHook(
        ({ state, hash }) => useLoadTrigger(state, hash),
        {
          initialProps: {
            state: "idle" as LoaderState,
            hash: '["Toyota"]',
          },
        }
      );

      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState, hash: '["Honda"]' });

      expect(result.current.shouldLoad).toBe(true);
    });

    it("shouldLoad is true when dependency changes from undefined", () => {
      const { result, rerender } = renderHook(
        ({ state, hash }) => useLoadTrigger(state, hash),
        {
          initialProps: {
            state: "idle" as LoaderState,
            hash: "[null]",
          },
        }
      );

      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState, hash: '["Toyota"]' });

      expect(result.current.shouldLoad).toBe(true);
    });
  });

  describe("loading state protection", () => {
    it("shouldLoad is false during loading even on first render", () => {
      const { result } = renderHook(() => useLoadTrigger("loading", null));
      expect(result.current.shouldLoad).toBe(false);
    });

    it("shouldLoad is false during loading even if deps changed", () => {
      const { result, rerender } = renderHook(
        ({ state, hash }) => useLoadTrigger(state, hash),
        {
          initialProps: {
            state: "idle" as LoaderState,
            hash: '["Toyota"]',
          },
        }
      );

      act(() => result.current.markLoaded());
      rerender({ state: "loading" as LoaderState, hash: '["Honda"]' });

      expect(result.current.shouldLoad).toBe(false);
    });
  });

  describe("markLoaded callback", () => {
    it("markLoaded updates internal refs correctly", () => {
      const { result, rerender } = renderHook(
        ({ state, hash }) => useLoadTrigger(state, hash),
        {
          initialProps: {
            state: "idle" as LoaderState,
            hash: '["Toyota"]',
          },
        }
      );

      // First load
      expect(result.current.shouldLoad).toBe(true);
      act(() => result.current.markLoaded());

      // After marking loaded, same hash should not trigger
      rerender({ state: "loaded" as LoaderState, hash: '["Toyota"]' });
      expect(result.current.shouldLoad).toBe(false);

      // New hash should trigger
      rerender({ state: "loaded" as LoaderState, hash: '["Honda"]' });
      expect(result.current.shouldLoad).toBe(true);

      // After marking loaded again, same hash should not trigger
      act(() => result.current.markLoaded());
      rerender({ state: "loaded" as LoaderState, hash: '["Honda"]' });
      expect(result.current.shouldLoad).toBe(false);
    });
  });
});
