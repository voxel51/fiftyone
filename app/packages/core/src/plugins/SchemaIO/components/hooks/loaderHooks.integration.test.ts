/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDependencyHash } from "./useDependencyHash";
import { useLoadTrigger, type LoaderState } from "./useLoadTrigger";
import { useExecuteLoader } from "./useExecuteLoader";

vi.mock("@fiftyone/operators", () => ({
  executeOperator: vi.fn(),
}));

import { executeOperator } from "@fiftyone/operators";
const mockExecuteOperator = vi.mocked(executeOperator);

/**
 * Integration tests that verify the loader hooks work correctly together.
 * These tests simulate the full lifecycle of the LoaderView component.
 */
describe("Loader hooks integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("load once on mount (no dependencies)", () => {
    it("loads once and never again without dependencies", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash({ make: "Toyota" }, undefined);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params: { make: "Toyota" },
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // First render: should load
      expect(result.current.shouldLoad).toBe(true);
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });

      // Simulate state change to loaded
      state = "loaded";
      rerender();

      // Should not reload
      expect(result.current.shouldLoad).toBe(false);
      expect(mockExecuteOperator).toHaveBeenCalledTimes(1);

      // Rerender multiple times - should never reload
      rerender();
      rerender();
      expect(result.current.shouldLoad).toBe(false);
    });

    it("does not reload when params change without dependencies", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota", year: 2020 };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, undefined);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      expect(mockExecuteOperator).toHaveBeenCalledTimes(1);

      // Change params - should NOT reload (no dependencies)
      params = { make: "Honda", year: 2021 };
      rerender();

      expect(result.current.shouldLoad).toBe(false);
      expect(mockExecuteOperator).toHaveBeenCalledTimes(1);
    });
  });

  describe("reload on dependency change", () => {
    it("reloads when tracked dependency changes", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota", year: 2020 };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["make"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      expect(mockExecuteOperator).toHaveBeenCalledTimes(1);

      // Change tracked dependency
      params = { make: "Honda", year: 2020 };
      rerender();

      expect(result.current.shouldLoad).toBe(true);
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });

      expect(mockExecuteOperator).toHaveBeenCalledTimes(2);
    });

    it("does NOT reload when untracked param changes", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota", year: 2020 };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["make"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      // Change untracked param
      params = { make: "Toyota", year: 2021 };
      rerender();

      expect(result.current.shouldLoad).toBe(false);
      expect(mockExecuteOperator).toHaveBeenCalledTimes(1);
    });

    it("reloads when any tracked dependency changes", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota", model: "Camry", year: 2020 };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["make", "model"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      // Change only model (tracked)
      params = { make: "Toyota", model: "Corolla", year: 2020 };
      rerender();

      expect(result.current.shouldLoad).toBe(true);
    });
  });

  describe("deep dependency paths", () => {
    it("tracks deeply nested dependencies", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = {
        filters: { category: "sedan", color: "red" },
        sort: "price",
      };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["filters.category"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      // Change tracked nested param
      params = {
        filters: { category: "suv", color: "red" },
        sort: "price",
      };
      rerender();

      expect(result.current.shouldLoad).toBe(true);
    });

    it("ignores non-tracked nested changes", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = {
        filters: { category: "sedan", color: "red" },
        sort: "price",
      };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["filters.category"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Initial load
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });
      state = "loaded";
      rerender();

      // Change non-tracked nested param (color instead of category)
      params = {
        filters: { category: "sedan", color: "blue" },
        sort: "price",
      };
      rerender();

      expect(result.current.shouldLoad).toBe(false);
    });
  });

  describe("loading state protection", () => {
    it("does not trigger multiple loads while loading", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota" };

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["make"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "loader",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // Start loading
      expect(result.current.shouldLoad).toBe(true);
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });

      // State changes to loading
      state = "loading";
      rerender();

      // Change dependency while loading
      params = { make: "Honda" };
      rerender();

      // Should not trigger another load while loading
      expect(result.current.shouldLoad).toBe(false);

      // After loading completes, dependency change should trigger
      state = "loaded";
      rerender();

      expect(result.current.shouldLoad).toBe(true);
    });
  });

  describe("full lifecycle simulation", () => {
    it("simulates complete LoaderView lifecycle", () => {
      const onChange = vi.fn();
      let state: LoaderState = "idle";
      let params = { make: "Toyota" };

      // Simulate success callback
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (r: unknown) => void }).callback({
          result: [{ id: 1, name: "Camry" }],
          error: null,
        });
        return Promise.resolve();
      });

      const { result, rerender } = renderHook(() => {
        const hash = useDependencyHash(params, ["make"]);
        const trigger = useLoadTrigger(state, hash);
        const execute = useExecuteLoader({
          operator: "@test/load",
          params,
          path: "models",
          onChange,
        });
        return { ...trigger, execute, hash };
      });

      // 1. Mount - should load
      expect(result.current.shouldLoad).toBe(true);
      act(() => {
        result.current.markLoaded();
        result.current.execute();
      });

      // 2. Verify loading state was set
      expect(onChange).toHaveBeenCalledWith("models", { state: "loading" });

      // 3. Verify loaded state was set
      expect(onChange).toHaveBeenCalledWith("models", {
        state: "loaded",
        data: [{ id: 1, name: "Camry" }],
      });

      // 4. State transitions to loaded
      state = "loaded";
      rerender();

      // 5. Same params - no reload
      expect(result.current.shouldLoad).toBe(false);

      // 6. Change dependency - should reload
      params = { make: "Honda" };
      rerender();

      expect(result.current.shouldLoad).toBe(true);
    });
  });
});
