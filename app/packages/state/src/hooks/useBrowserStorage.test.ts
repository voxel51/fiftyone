import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBrowserStorage } from "./useBrowserStorage";

// Utility wrapper for cleaner access
const useTestableState = (...args: Parameters<typeof useBrowserStorage>) => {
  const [value, setState] = useBrowserStorage(...args);
  return { value, setState };
};

describe("useBrowserStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("undefined value handling", () => {
    it("should remove item from storage when setting undefined (no parseFn)", () => {
      const { result } = renderHook(() => useTestableState("test-key", "default"));

      act(() => {
        result.current.setState("test-value");
      });
      expect(localStorage.getItem("test-key")).toBe('"test-value"');

      act(() => {
        result.current.setState(undefined as any);
      });
      expect(localStorage.getItem("test-key")).toBeNull();
    });

    it("should remove item from storage when setting undefined (with parseFn)", () => {
      const parseFn = {
        parse: (value: string) => JSON.parse(value),
        stringify: (value: any) => JSON.stringify(value),
      };

      const { result } = renderHook(() =>
        useTestableState("test-key", { default: "value" }, false, parseFn)
      );

      act(() => {
        result.current.setState({ test: "data" });
      });
      expect(localStorage.getItem("test-key")).toBe('{"test":"data"}');

      act(() => {
        result.current.setState(undefined as any);
      });
      expect(localStorage.getItem("test-key")).toBeNull();
    });

    it("should handle function updates that return undefined", () => {
      const { result } = renderHook(() => useTestableState("test-key", 0));

      act(() => {
        result.current.setState((prev: number) => prev + 1);
      });
      expect(result.current.value).toBe(1);
      expect(localStorage.getItem("test-key")).toBe("1");

      act(() => {
        result.current.setState(() => undefined as any);
      });
      expect(localStorage.getItem("test-key")).toBeNull();
    });
  });

  describe("reading 'undefined' string from storage", () => {
    it("should treat stored 'undefined' string as null and use default value", () => {
      localStorage.setItem("test-key", "undefined");

      const { result } = renderHook(() => useTestableState("test-key", "default-value"));
      expect(result.current.value).toBe("default-value");
    });

    it("should treat stored 'undefined' string as null with custom parseFn", () => {
      localStorage.setItem("test-key", "undefined");

      const parseFn = {
        parse: (value: string) => JSON.parse(value),
        stringify: (value: any) => JSON.stringify(value),
      };

      const { result } = renderHook(() =>
        useTestableState("test-key", { default: "value" }, false, parseFn)
      );

      expect(result.current.value).toEqual({ default: "value" });
    });
  });

  describe("sessionStorage support", () => {
    it("should handle undefined values in sessionStorage", () => {
      const { result } = renderHook(() => useTestableState("test-key", "default", true));

      act(() => {
        result.current.setState("test-value");
      });
      expect(sessionStorage.getItem("test-key")).toBe('"test-value"');

      act(() => {
        result.current.setState(undefined as any);
      });
      expect(sessionStorage.getItem("test-key")).toBeNull();
    });

    it("should treat stored 'undefined' string as null in sessionStorage", () => {
      sessionStorage.setItem("test-key", "undefined");

      const { result } = renderHook(() => useTestableState("test-key", "default-value", true));
      expect(result.current.value).toBe("default-value");
    });
  });

  describe("null value handling", () => {
    it("should handle null values by not removing from storage", () => {
      const { result } = renderHook(() => useTestableState("test-key", "default"));

      act(() => {
        result.current.setState("test-value");
      });
      expect(localStorage.getItem("test-key")).toBe('"test-value"');

      act(() => {
        result.current.setState(null as any);
      });
      expect(localStorage.getItem("test-key")).toEqual("null");
    });
  });

  describe("basic functionality", () => {
    it("should work with normal values", () => {
      const { result } = renderHook(() => useTestableState("test-key", "default"));

      act(() => {
        result.current.setState("test-value");
      });

      expect(result.current.value).toBe("test-value");
      expect(localStorage.getItem("test-key")).toBe('"test-value"');
    });

    it("should work with objects", () => {
      const { result } = renderHook(() => useTestableState("test-key", {}));

      const testObj = { name: "test", value: 123 };
      act(() => {
        result.current.setState(testObj);
      });

      expect(result.current.value).toEqual(testObj);
      expect(localStorage.getItem("test-key")).toBe(JSON.stringify(testObj));
    });

    it("should work with numbers", () => {
      const { result } = renderHook(() => useTestableState("test-key", 0));

      act(() => {
        result.current.setState(42);
      });

      expect(result.current.value).toBe(42);
      expect(localStorage.getItem("test-key")).toBe("42");
    });

    it("should work with function updates", () => {
      const { result } = renderHook(() => useTestableState("test-key", 41));

      act(() => {
        result.current.setState((prev: number) => prev + 10);
      });

      expect(result.current.value).toBe(51);
      expect(localStorage.getItem("test-key")).toBe("51");
    });
  });
});
