import { clearChannel, getEventBus } from "@fiftyone/events";
import { act, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useQueryPerformanceTimeout from "./Filters/use-query-performance-timeout";
import QueryPerformanceToast, {
  QP_WAIT,
  type QueryPerformanceEvents,
} from "./QueryPerformanceToast";

const shouldOptimize = vi.hoisted(() => vi.fn());

vi.mock("recoil", () => ({
  atom: (options: unknown) => options,
  useRecoilState: () => [false, vi.fn()],
  useRecoilValue: shouldOptimize,
}));

vi.mock("@fiftyone/state", () => ({
  getBrowserStorageEffectForKey: () => () => undefined,
  pathCanBeOptimized: (path: string) => path,
}));

vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));

vi.mock("@fiftyone/components", () => ({
  Toast: ({ message }: { message: React.ReactNode }) => (
    <div data-testid="toast">{message}</div>
  ),
  useTheme: () => ({ custom: {}, primary: {}, text: {} }),
}));

const SLOW = "query-performance:slow";

describe("query performance toast events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearChannel();
  });

  it("sends a slow query on the bus once the wait passes", () => {
    shouldOptimize.mockReturnValue({ isFrameField: true });
    const slow = vi.fn();
    getEventBus<QueryPerformanceEvents>().on(SLOW, slow);

    renderHook(() => useQueryPerformanceTimeout(false, "ground_truth"));
    vi.advanceTimersByTime(QP_WAIT - 1);
    expect(slow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(slow).toHaveBeenCalledExactlyOnceWith({
      path: "ground_truth",
      isFrameField: true,
    });
  });

  it("sends nothing in the modal", () => {
    shouldOptimize.mockReturnValue({ isFrameField: false });
    const slow = vi.fn();
    getEventBus<QueryPerformanceEvents>().on(SLOW, slow);

    renderHook(() => useQueryPerformanceTimeout(true, "ground_truth"));
    vi.advanceTimersByTime(QP_WAIT);

    expect(slow).not.toHaveBeenCalled();
  });

  it("shows the toast for a slow query on the bus", () => {
    const host = document.createElement("div");
    host.id = "queryPerformance";
    document.body.appendChild(host);
    const onDispatch = vi.fn();

    try {
      render(<QueryPerformanceToast onDispatch={onDispatch} />);
      expect(screen.queryByTestId("toast")).toBeNull();

      act(() => {
        getEventBus<QueryPerformanceEvents>().dispatch(SLOW, {
          path: "ground_truth",
          isFrameField: false,
        });
      });

      expect(onDispatch).toHaveBeenCalledExactlyOnceWith({
        path: "ground_truth",
        isFrameField: false,
      });
      expect(screen.getByTestId("toast").textContent).toContain(
        "Query Performance is Available!",
      );
    } finally {
      host.remove();
    }
  });
});
