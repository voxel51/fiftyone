import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESTINATION_LOADING_WATCHDOG_MS,
  DestinationVisitProvider,
  useDestinationVisit,
} from "./destination-visit";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderVisit(initialKey: string) {
  let visitKey = initialKey;
  const hook = renderHook(() => useDestinationVisit(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <DestinationVisitProvider visitKey={visitKey}>
        {children}
      </DestinationVisitProvider>
    ),
  });
  return {
    ...hook,
    navigate: (next: string) => {
      visitKey = next;
      hook.rerender();
    },
  };
}

describe("destination visit", () => {
  it("latches each visit and ignores settles from an earlier A in A to B to A", () => {
    const visit = renderVisit("a");
    const firstA = visit.result.current.settle;
    expect(visit.result.current.settled).toBe(false);
    act(() => firstA());
    expect(visit.result.current.settled).toBe(true);
    visit.navigate("b");
    expect(visit.result.current.settled).toBe(false);
    visit.navigate("a");
    act(() => firstA());
    expect(visit.result.current.settled).toBe(false);
    act(() => visit.result.current.settle());
    expect(visit.result.current.settled).toBe(true);
  });

  it("settles a visit that never reports an outcome, timed from navigation", () => {
    vi.useFakeTimers();
    const visit = renderVisit("a");
    act(() => vi.advanceTimersByTime(DESTINATION_LOADING_WATCHDOG_MS / 2));
    visit.navigate("b");
    act(() => vi.advanceTimersByTime(DESTINATION_LOADING_WATCHDOG_MS / 2));
    expect(visit.result.current.settled).toBe(false);
    act(() => vi.advanceTimersByTime(DESTINATION_LOADING_WATCHDOG_MS / 2));
    expect(visit.result.current.settled).toBe(true);
  });

  it("leaves hosts without a visit scope unsettled", () => {
    const { result } = renderHook(() => useDestinationVisit());
    act(() => result.current.settle());
    expect(result.current.settled).toBe(false);
  });
});
