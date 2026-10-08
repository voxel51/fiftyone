import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@fiftyone/state", () => ({ useCurrentDatasetName: () => "ds" }));
vi.mock("./state", () => ({ useOperatorExecutor: () => ({ execute }) }));

import usePendingRuns, { usePendingRunScreen } from "./usePendingRuns";

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
  });
  afterEach(() => vi.useRealTimers());

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
    const { result } = renderHook(() => usePendingRunScreen(runs));

    act(() => result.current.open("1"));
    expect(result.current.screen).toMatchObject({
      title: "viz",
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
