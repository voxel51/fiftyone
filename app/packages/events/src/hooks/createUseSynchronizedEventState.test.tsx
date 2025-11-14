import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createUseSynchronizedEventState,
  createUseSynchronizedEventStateWithDefaults,
} from "./createUseSynchronizedEventState";
import { useEventBus } from "./useEventBus";
import { __test__ } from "../state/EventStateStore";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
};

describe("createUseSynchronizedEventState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __test__.registry.clear();
  });

  test("should create a hook that returns undefined initially", () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result } = renderHook(() => useTestEventState("test:eventA"));

    expect(result.current).toBeUndefined();
  });

  test("should return latest event payload after dispatch", async () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const { result } = renderHook(() => useTestEventState("test:eventA"));

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should update when new event is dispatched", async () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );
    const { result } = renderHook(() => useTestEventState("test:eventA"));

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test1" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test1" });
    });

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "2", name: "test2" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "2", name: "test2" });
    });
  });

  test("should prevent tearing across multiple components", async () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result: result1 } = renderHook(() =>
      useTestEventState("test:eventA")
    );
    const { result: result2 } = renderHook(() =>
      useTestEventState("test:eventA")
    );
    const { result: result3 } = renderHook(() =>
      useTestEventState("test:eventA")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });

    await waitFor(() => {
      expect(result1.current).toEqual({ id: "1", name: "test" });
      expect(result2.current).toEqual({ id: "1", name: "test" });
      expect(result3.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should handle different event types independently", async () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result: resultA } = renderHook(() =>
      useTestEventState("test:eventA")
    );
    const { result: resultB } = renderHook(() =>
      useTestEventState("test:eventB")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
      busResult.current.dispatch("test:eventB", { value: 42 });
    });

    await waitFor(() => {
      expect(resultA.current).toEqual({ id: "1", name: "test" });
      expect(resultB.current).toEqual({ value: 42 });
    });
  });

  test("should maintain state across re-renders", async () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result, rerender } = renderHook(() =>
      useTestEventState("test:eventA")
    );

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });

    rerender();
    expect(result.current).toEqual({ id: "1", name: "test" });
  });

  test("should handle events with no payload", () => {
    const useTestEventState = createUseSynchronizedEventState<TestEventGroup>();
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result } = renderHook(() => useTestEventState("test:eventC"));

    expect(result.current).toBeUndefined();
    busResult.current.dispatch("test:eventC");
    expect(result.current).toBeUndefined();
  });
});

describe("createUseSynchronizedEventStateWithDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __test__.registry.clear();
  });

  test("should return default value initially", () => {
    const defaults = {
      "test:eventA": { id: "default", name: "default" },
      "test:eventB": { value: 0 },
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);

    const { result: resultA } = renderHook(() =>
      useTestEventState("test:eventA")
    );
    const { result: resultB } = renderHook(() =>
      useTestEventState("test:eventB")
    );

    expect(resultA.current).toEqual({ id: "default", name: "default" });
    expect(resultB.current).toEqual({ value: 0 });
  });

  test("should return latest event payload after dispatch", async () => {
    const defaults = {
      "test:eventA": { id: "default", name: "default" },
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result } = renderHook(() => useTestEventState("test:eventA"));

    expect(result.current).toEqual({ id: "default", name: "default" });

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });
    await waitFor(() => {
      expect(result.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should allow overriding default per call", () => {
    const defaults = {
      "test:eventA": { id: "default", name: "default" },
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);

    const overrideDefault = { id: "override", name: "override" };
    const { result } = renderHook(() =>
      useTestEventState("test:eventA", overrideDefault)
    );

    expect(result.current).toEqual(overrideDefault);
  });

  test("should return undefined for events without defaults when no override provided", () => {
    const defaults = {
      "test:eventA": { id: "default", name: "default" },
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);

    const { result } = renderHook(() => useTestEventState("test:eventB"));

    // Should fall back to useEventState behavior (undefined)
    expect(result.current).toBeUndefined();
  });

  test("should prevent tearing with defaults", async () => {
    const defaults = {
      "test:eventA": { id: "default", name: "default" },
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result: result1 } = renderHook(() =>
      useTestEventState("test:eventA")
    );
    const { result: result2 } = renderHook(() =>
      useTestEventState("test:eventA")
    );

    expect(result1.current).toEqual({ id: "default", name: "default" });
    expect(result2.current).toEqual({ id: "default", name: "default" });

    act(() => {
      busResult.current.dispatch("test:eventA", { id: "1", name: "test" });
    });

    await waitFor(() => {
      expect(result1.current).toEqual({ id: "1", name: "test" });
      expect(result2.current).toEqual({ id: "1", name: "test" });
    });
  });

  test("should handle events with no payload and defaults", () => {
    const defaults: { "test:eventC"?: undefined } = {
      "test:eventC": undefined,
    };
    const useTestEventState =
      createUseSynchronizedEventStateWithDefaults<TestEventGroup>(defaults);
    const { result: busResult } = renderHook(() =>
      useEventBus<TestEventGroup>()
    );

    const { result } = renderHook(() => useTestEventState("test:eventC"));

    expect(result.current).toBeUndefined();
    busResult.current.dispatch("test:eventC");
    expect(result.current).toBeUndefined();
  });
});
