/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useExecuteLoader } from "./useExecuteLoader";

vi.mock("@fiftyone/operators", () => ({
  executeOperator: vi.fn(),
}));

import { executeOperator } from "@fiftyone/operators";

const mockExecuteOperator = vi.mocked(executeOperator);

describe("useExecuteLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when operator is undefined", () => {
    it("does nothing when operator is undefined", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: undefined,
          params: {},
          path: "loader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).not.toHaveBeenCalled();
      expect(mockExecuteOperator).not.toHaveBeenCalled();
    });
  });

  describe("when operator is defined", () => {
    it("sets loading state immediately", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: { key: "value" },
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).toHaveBeenCalledWith("myLoader", { state: "loading" });
    });

    it("calls executeOperator with correct arguments", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: { key: "value" },
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(mockExecuteOperator).toHaveBeenCalledWith(
        "@test/load",
        { key: "value" },
        expect.objectContaining({ callback: expect.any(Function) })
      );
    });
  });

  describe("success callback", () => {
    it("sets loaded state with data on success", () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (r: unknown) => void }).callback({
          result: { items: [1, 2, 3] },
          error: null,
        });
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: {},
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).toHaveBeenCalledWith("myLoader", {
        state: "loaded",
        data: { items: [1, 2, 3] },
      });
    });

    it("handles null result correctly", () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (r: unknown) => void }).callback({
          result: null,
          error: null,
        });
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: {},
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).toHaveBeenCalledWith("myLoader", {
        state: "loaded",
        data: null,
      });
    });
  });

  describe("error callback", () => {
    it("sets errored state with errorMessage", () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (r: unknown) => void }).callback({
          error: "Failed",
          errorMessage: "Network error occurred",
        });
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: {},
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).toHaveBeenCalledWith("myLoader", {
        state: "errored",
        error: "Network error occurred",
      });
    });

    it("falls back to stringified error when errorMessage is missing", () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (r: unknown) => void }).callback({
          error: "Raw error string",
        });
        return Promise.resolve();
      });

      const { result } = renderHook(() =>
        useExecuteLoader({
          operator: "@test/load",
          params: {},
          path: "myLoader",
          onChange,
        })
      );

      act(() => result.current());

      expect(onChange).toHaveBeenCalledWith("myLoader", {
        state: "errored",
        error: "Raw error string",
      });
    });
  });

  describe("callback stability", () => {
    it("returns stable callback when inputs are unchanged", () => {
      const onChange = vi.fn();
      const params = { key: "value" };

      const { result, rerender } = renderHook(
        ({ params }) =>
          useExecuteLoader({
            operator: "@test/load",
            params,
            path: "myLoader",
            onChange,
          }),
        { initialProps: { params } }
      );

      const firstCallback = result.current;

      rerender({ params });

      expect(result.current).toBe(firstCallback);
    });

    it("returns new callback when params change", () => {
      const onChange = vi.fn();

      const { result, rerender } = renderHook(
        ({ params }) =>
          useExecuteLoader({
            operator: "@test/load",
            params,
            path: "myLoader",
            onChange,
          }),
        { initialProps: { params: { key: "value1" } } }
      );

      const firstCallback = result.current;

      rerender({ params: { key: "value2" } });

      expect(result.current).not.toBe(firstCallback);
    });
  });
});
