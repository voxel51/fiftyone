/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDeferredSearch } from "./useDeferredSearch";

const render = (settled: boolean, registered: boolean) => {
  const submit = vi.fn();
  const onUnavailable = vi.fn();
  const onHold = vi.fn();
  const onDrop = vi.fn();
  const hook = renderHook(
    (props: { settled: boolean; registered: boolean }) =>
      useDeferredSearch({ ...props, submit, onUnavailable, onHold, onDrop }),
    { initialProps: { settled, registered } },
  );
  return { ...hook, submit, onUnavailable, onHold, onDrop };
};

describe("useDeferredSearch", () => {
  it("runs the query at once when the registry has the operator", () => {
    const { result, submit, onUnavailable, onHold } = render(true, true);
    act(() => result.current("red cars"));
    expect(submit).toHaveBeenCalledWith("red cars");
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
  });

  it("explains itself when the registry has loaded without the operator", () => {
    const { result, submit, onUnavailable } = render(true, false);
    act(() => result.current("red cars"));
    expect(submit).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("holds a query until the registry loads, then runs it", () => {
    const { result, rerender, submit, onUnavailable, onHold, onDrop } = render(
      false,
      false,
    );
    act(() => result.current("red cars"));
    expect(submit).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    // The wait shows as in flight from the moment of Enter
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();

    rerender({ settled: true, registered: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("red cars");
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  // Also the failed-listing case: the registry settles without the operator
  it("holds a query, then explains itself if the operator never appears", () => {
    const { result, rerender, submit, onUnavailable, onDrop } = render(
      false,
      false,
    );
    act(() => result.current("red cars"));

    rerender({ settled: true, registered: false });
    expect(submit).not.toHaveBeenCalled();
    // The in-flight state ends before the explanation
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest held query", () => {
    const { result, rerender, submit } = render(false, false);
    act(() => result.current("red cars"));
    act(() => result.current("blue trucks"));

    rerender({ settled: true, registered: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("blue trucks");
  });
});
