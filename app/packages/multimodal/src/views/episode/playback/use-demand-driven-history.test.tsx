import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FULL_HISTORY_RETENTION_MS,
  type DemandDrivenHistoryLoader,
  useDemandDrivenHistory,
} from "./use-demand-driven-history";

interface TestHistory {
  readonly status: "loading" | "ready";
}

type LoadStream = (
  loader: DemandDrivenHistoryLoader<TestHistory>,
) => Promise<void>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDemandDrivenHistory", () => {
  it("starts only demanded streams and cancels unfinished work at zero demand", () => {
    const controls: DemandDrivenHistoryLoader<TestHistory>[] = [];
    const loadStream = vi.fn<LoadStream>(async (loader) => {
      controls.push(loader);
      loader.commit({ status: "loading" });
      await new Promise<void>(() => undefined);
    });
    const view = render(
      <Harness loadStream={loadStream} sourceKey="source" streams={[]} />,
    );
    expect(loadStream).not.toHaveBeenCalled();

    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={["/gps"]} />,
    );
    expect(loadStream).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("history").textContent).toBe("/gps:loading");

    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={[]} />,
    );
    expect(controls[0]?.control.isCancelled()).toBe(true);
    expect(screen.getByTestId("history").textContent).toBe("");
  });

  it("shares a retained result across a reopen and expires it after the TTL", async () => {
    vi.useFakeTimers();
    const loadStream = vi.fn<LoadStream>(({ commit }) => {
      commit({ status: "ready" });
      return Promise.resolve();
    });
    const view = render(
      <Harness loadStream={loadStream} sourceKey="source" streams={["/gps"]} />,
    );
    expect(loadStream).toHaveBeenCalledTimes(1);

    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={[]} />,
    );
    await advanceTimers(FULL_HISTORY_RETENTION_MS - 1);
    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={["/gps"]} />,
    );
    expect(loadStream).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("history").textContent).toBe("/gps:ready");

    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={[]} />,
    );
    await advanceTimers(FULL_HISTORY_RETENTION_MS);
    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source" streams={["/gps"]} />,
    );
    expect(loadStream).toHaveBeenCalledTimes(2);
  });

  it("releases retained values immediately when the source changes", () => {
    const controls: DemandDrivenHistoryLoader<TestHistory>[] = [];
    const loadStream = vi.fn<LoadStream>((loader) => {
      controls.push(loader);
      loader.commit({ status: "ready" });
      return Promise.resolve();
    });
    const view = render(
      <Harness
        loadStream={loadStream}
        sourceKey="source-a"
        streams={["/gps"]}
      />,
    );
    expect(screen.getByTestId("history").textContent).toBe("/gps:ready");

    view.rerender(
      <Harness loadStream={loadStream} sourceKey="source-b" streams={[]} />,
    );
    expect(controls[0]?.control.isCancelled()).toBe(true);
    expect(screen.getByTestId("history").textContent).toBe("");
  });
});

function Harness({
  loadStream,
  sourceKey,
  streams,
}: {
  readonly loadStream: (
    loader: DemandDrivenHistoryLoader<TestHistory>,
  ) => Promise<void>;
  readonly sourceKey: string;
  readonly streams: readonly string[];
}) {
  const history = useDemandDrivenHistory({
    initialDelayMs: 0,
    isRetainable: (value: TestHistory) => value.status === "ready",
    loadStream,
    readIdentity: sourceKey,
    retryDelayMs: 1,
    shouldStandDown: () => false,
    sourceKey,
    streams,
  });

  return (
    <div data-testid="history">
      {[...history]
        .map(([stream, value]) => `${stream}:${value.status}`)
        .join()}
    </div>
  );
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
