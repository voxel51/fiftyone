import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({ current: [] as { brain_key: string }[] }));

vi.mock("@fiftyone/operators", () => ({
  usePendingRuns: () => ({ runs: pending.current, loaded: true }),
}));

import usePendingSimilarityRuns from "./usePendingSimilarityRuns";

describe("usePendingSimilarityRuns", () => {
  it("drops a pending run whose key is already an index", () => {
    pending.current = [{ brain_key: "sim_a" }, { brain_key: "sim_b" }];
    const { result } = renderHook(() =>
      usePendingSimilarityRuns([{ key: "sim_a" }]),
    );

    expect(result.current.runs).toEqual([{ brain_key: "sim_b" }]);
    expect(result.current.loaded).toBe(true);
  });

  it("adds registered runs without results as in progress", () => {
    pending.current = [];
    const { result } = renderHook(() =>
      usePendingSimilarityRuns([{ key: "sim_a" }], ["sim_b"]),
    );

    expect(result.current.runs).toMatchObject([
      { brain_key: "sim_b", run_state: "in_progress" },
    ]);
  });

  it("lists a delegated run once when its key is also unready", () => {
    pending.current = [{ brain_key: "sim_b" }];
    const { result } = renderHook(() =>
      usePendingSimilarityRuns([], ["sim_b"]),
    );

    expect(result.current.runs).toEqual([{ brain_key: "sim_b" }]);
  });
});
