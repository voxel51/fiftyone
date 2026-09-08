/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDeferredSearch } from "./useDeferredSearch";

const render = (loaded: boolean, registered: boolean) => {
  const submit = vi.fn();
  const onUnavailable = vi.fn();
  const hook = renderHook(
    (props: { loaded: boolean; registered: boolean }) =>
      useDeferredSearch({ ...props, submit, onUnavailable }),
    { initialProps: { loaded, registered } },
  );
  return { ...hook, submit, onUnavailable };
};

describe("useDeferredSearch", () => {
  it("runs the query at once when the registry has the operator", () => {
    const { result, submit, onUnavailable } = render(true, true);
    act(() => result.current("red cars"));
    expect(submit).toHaveBeenCalledWith("red cars");
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("explains itself when the registry has loaded without the operator", () => {
    const { result, submit, onUnavailable } = render(true, false);
    act(() => result.current("red cars"));
    expect(submit).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("holds a query until the registry loads, then runs it", () => {
    const { result, rerender, submit, onUnavailable } = render(false, false);
    act(() => result.current("red cars"));
    expect(submit).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();

    rerender({ loaded: true, registered: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("red cars");
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("holds a query, then explains itself if the operator never appears", () => {
    const { result, rerender, submit, onUnavailable } = render(false, false);
    act(() => result.current("red cars"));

    rerender({ loaded: true, registered: false });
    expect(submit).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest held query", () => {
    const { result, rerender, submit } = render(false, false);
    act(() => result.current("red cars"));
    act(() => result.current("blue trucks"));

    rerender({ loaded: true, registered: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("blue trucks");
  });
});
