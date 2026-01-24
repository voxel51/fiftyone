/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useDependencyHash } from "./useDependencyHash";

describe("useDependencyHash", () => {
  describe("no dependencies", () => {
    it("returns null when dependencies is undefined", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ foo: "bar" }, undefined)
      );
      expect(result.current).toBeNull();
    });

    it("returns null for empty dependencies array", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ foo: "bar" }, [])
      );
      expect(result.current).toBeNull();
    });
  });

  describe("shallow dependencies", () => {
    it("returns hash of single dependency value", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ make: "Toyota", year: 2020 }, ["make"])
      );
      expect(result.current).toBe(JSON.stringify(["Toyota"]));
    });

    it("returns hash of multiple dependency values", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ make: "Toyota", year: 2020, color: "red" }, [
          "make",
          "year",
        ])
      );
      expect(result.current).toBe(JSON.stringify(["Toyota", 2020]));
    });
  });

  describe("deep dependencies", () => {
    it("returns hash of nested dependency value", () => {
      const params = { filters: { category: "sedan", color: "red" } };
      const { result } = renderHook(() =>
        useDependencyHash(params, ["filters.category"])
      );
      expect(result.current).toBe(JSON.stringify(["sedan"]));
    });

    it("returns hash of deeply nested dependency value", () => {
      const params = { options: { display: { theme: "dark" } } };
      const { result } = renderHook(() =>
        useDependencyHash(params, ["options.display.theme"])
      );
      expect(result.current).toBe(JSON.stringify(["dark"]));
    });
  });

  describe("missing paths", () => {
    it("returns undefined for missing paths", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ foo: "bar" }, ["missing"])
      );
      expect(result.current).toBe(JSON.stringify([undefined]));
    });

    it("returns undefined for missing nested paths", () => {
      const { result } = renderHook(() =>
        useDependencyHash({ foo: "bar" }, ["missing.nested.path"])
      );
      expect(result.current).toBe(JSON.stringify([undefined]));
    });
  });

  describe("reactivity", () => {
    it("updates hash when dependency value changes", () => {
      const { result, rerender } = renderHook(
        ({ params }) => useDependencyHash(params, ["make"]),
        { initialProps: { params: { make: "Toyota" } } }
      );

      expect(result.current).toBe(JSON.stringify(["Toyota"]));

      rerender({ params: { make: "Honda" } });
      expect(result.current).toBe(JSON.stringify(["Honda"]));
    });

    it("hash is stable when non-dependency values change", () => {
      const { result, rerender } = renderHook(
        ({ params }) => useDependencyHash(params, ["make"]),
        { initialProps: { params: { make: "Toyota", year: 2020 } } }
      );

      const initialHash = result.current;

      rerender({ params: { make: "Toyota", year: 2021 } });
      expect(result.current).toBe(initialHash);
    });

    it("hash changes when any tracked dependency changes", () => {
      const { result, rerender } = renderHook(
        ({ params }) => useDependencyHash(params, ["make", "year"]),
        { initialProps: { params: { make: "Toyota", year: 2020 } } }
      );

      const initialHash = result.current;

      // Change only year
      rerender({ params: { make: "Toyota", year: 2021 } });
      expect(result.current).not.toBe(initialHash);
    });
  });
});
