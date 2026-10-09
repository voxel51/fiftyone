import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@fiftyone/state", () => ({ useCurrentDatasetName: () => "ds" }));
const registry = vi.hoisted(() => ({ initialized: true, found: true }));
vi.mock("recoil", () => ({ useRecoilValue: () => registry.initialized }));
vi.mock("./state", () => ({
  OperatorLoadResult: { SUCCESS: "success", NOT_FOUND: "not_found" },
  operatorsInitializedAtom: {},
  useOperatorExecutor: () => ({
    execute,
    loadResult: registry.found ? "success" : "not_found",
  }),
}));

import usePendingRuns, { usePendingRunScreen } from "./usePendingRuns";

const withoutStages = { operators: ["op"] };
const config = { operators: ["op"], stageOperators: ["stage"] };
const run = (run_state: string) => ({
  id: "1",
  operator: "op",
  run_state,
  label: null,
  brain_key: null,
});
const respond = (runs: unknown[]) =>
  execute.mockImplementation((_params, { callback }) =>
    callback({ result: runs }),
  );

describe("usePendingRuns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    execute.mockReset();
    registry.initialized = true;
    registry.found = true;
  });
  afterEach(() => vi.useRealTimers());

  it("reports loaded once the first fetch returns", () => {
    let finish: (result: unknown) => void = () => {};
    execute.mockImplementation((_params, { callback }) => {
      finish = callback;
    });
    const { result } = renderHook(() => usePendingRuns(config));
    expect(result.current.loaded).toBe(false);

    act(() => finish({ result: [] }));
    expect(result.current.loaded).toBe(true);
  });

  it("waits for the operator registry before fetching", () => {
    registry.initialized = false;
    const { result, rerender } = renderHook(() => usePendingRuns(config));

    expect(execute).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);

    registry.initialized = true;
    respond([]);
    rerender();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("is loaded without fetching when the operator is unavailable", () => {
    registry.found = false;
    const { result } = renderHook(() => usePendingRuns(config));

    expect(execute).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(true);
  });

  it("fetches once when no stage operators are configured", () => {
    execute.mockImplementation((_params, { callback }) =>
      callback({ result: [run("failed")] }),
    );
    renderHook(() => usePendingRuns(withoutStages));

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("fetches on mount with the configured operators", () => {
    respond([run("queued")]);
    const { result } = renderHook(() => usePendingRuns(config));

    expect(execute.mock.calls[0][0]).toEqual({
      operators: ["op"],
      stage_operators: ["stage"],
    });
    expect(result.current.runs).toMatchObject([run("queued")]);
  });

  it("polls while a run is active and stops once none is", () => {
    respond([run("running")]);
    renderHook(() => usePendingRuns(config));
    expect(execute).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5000));
    expect(execute).toHaveBeenCalledTimes(2);

    respond([]);
    act(() => vi.advanceTimersByTime(5000));
    expect(execute).toHaveBeenCalledTimes(3);

    act(() => vi.advanceTimersByTime(20000));
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not poll for failed runs", () => {
    respond([run("failed")]);
    renderHook(() => usePendingRuns(config));

    act(() => vi.advanceTimersByTime(20000));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refetches when the refresh key changes", () => {
    respond([]);
    const { rerender } = renderHook(({ key }) => usePendingRuns(config, key), {
      initialProps: { key: 1 },
    });
    rerender({ key: 2 });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous runs when a fetch errors", () => {
    respond([run("queued")]);
    const { result } = renderHook(() => usePendingRuns(config));

    execute.mockImplementation((_params, { callback }) =>
      callback({ error: "boom" }),
    );
    act(() => {
      result.current.refresh();
    });

    expect(result.current.runs).toMatchObject([run("queued")]);
  });

  it("views a run through onViewRun", () => {
    const onViewRun = vi.fn();
    respond([run("queued")]);

    const { result } = renderHook(() =>
      usePendingRuns({ ...config, onViewRun }),
    );
    result.current.runs[0].onView?.();

    expect(onViewRun).toHaveBeenCalledWith(run("queued"), {
      datasetName: "ds",
    });
  });

  it("cannot view a run without onViewRun", () => {
    respond([run("queued")]);

    const { result } = renderHook(() => usePendingRuns(config));

    expect(result.current.runs[0].onView).toBeUndefined();
  });
});

describe("usePendingRunScreen", () => {
  const onView = vi.fn();
  const runs = [
    { ...run("processing"), brain_key: "viz", onView },
    { ...run("queued"), id: "2", label: "Other" },
  ];

  it("has no screen until a run is opened", () => {
    const { result } = renderHook(() => usePendingRunScreen(runs));

    expect(result.current.screen).toBeUndefined();
  });

  it("describes the opened run and closes on back", () => {
    const { result } = renderHook(() => usePendingRunScreen(runs, "Hello"));

    act(() => result.current.open("1"));
    expect(result.current.screen).toMatchObject({
      title: "viz",
      description: "Hello",
      status: "running",
      runTitle: "Running",
      onViewStatus: onView,
    });

    act(() => result.current.screen!.onBack());
    expect(result.current.screen).toBeUndefined();
  });

  it("closes when the run leaves the list", () => {
    const { result, rerender } = renderHook(
      ({ list }) => usePendingRunScreen(list),
      { initialProps: { list: runs } },
    );

    act(() => result.current.open("2"));
    expect(result.current.screen?.title).toBe("Other");

    rerender({ list: [runs[0]] });
    expect(result.current.screen).toBeUndefined();
  });
});
