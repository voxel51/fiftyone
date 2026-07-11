import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markModalLoadingLatencyEvent,
  markModalLoadingLatencyEventAfterPaint,
  startModalLoadingLatencySession,
} from "./modal-loading-latency";

describe("modal loading latency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("location", {
      href: "http://localhost/datasets/test?modalLoadingLatencyDebug=1",
      search: "?modalLoadingLatencyDebug=1",
    });
    document.documentElement.removeAttribute(
      "data-modal-loading-latency-events",
    );
  });

  it("publishes events relative to the current loading session", () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    startModalLoadingLatencySession({
      detail: { sampleId: "sample-1" },
      entryPath: "grid",
    });
    now = 125.25;
    markModalLoadingLatencyEvent("host modal committed", {
      tickNs: 2n,
    });

    expect(publishedEvents()).toEqual([
      expect.objectContaining({
        detail: { entryPath: "grid", sampleId: "sample-1" },
        elapsedMs: 0,
        name: "session start",
      }),
      expect.objectContaining({
        detail: { tickNs: "2" },
        elapsedMs: 25.3,
        name: "host modal committed",
      }),
    ]);
  });

  it("deduplicates once-only milestones", () => {
    startModalLoadingLatencySession({ entryPath: "next" });
    markModalLoadingLatencyEvent(
      "shell painted",
      { sourceId: "source-1" },
      { onceKey: "shell-painted" },
    );
    markModalLoadingLatencyEvent(
      "shell painted",
      { sourceId: "source-1" },
      { onceKey: "shell-painted" },
    );

    expect(
      publishedEvents().filter((event) => event.name === "shell painted"),
    ).toHaveLength(1);
  });

  it("marks paint after two animation frames", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    startModalLoadingLatencySession({ entryPath: "previous" });

    markModalLoadingLatencyEventAfterPaint("shell painted");
    expect(
      publishedEvents().some((event) => event.name === "shell painted"),
    ).toBe(false);

    callbacks.shift()?.(0);
    expect(
      publishedEvents().some((event) => event.name === "shell painted"),
    ).toBe(false);
    callbacks.shift()?.(16);

    expect(publishedEvents().at(-1)?.name).toBe("shell painted");
  });

  it("serializes non-plain values and circular details safely", () => {
    startModalLoadingLatencySession({ entryPath: "grid" });
    const detail: Record<string, unknown> = {
      date: new Date("2026-07-10T00:00:00.000Z"),
      invalidDate: new Date(Number.NaN),
      map: new Map([["tick", 2n]]),
      set: new Set([3n]),
    };
    detail.self = detail;

    markModalLoadingLatencyEvent("complex detail", detail);

    expect(publishedEvents().at(-1)?.detail).toEqual({
      date: "2026-07-10T00:00:00.000Z",
      invalidDate: "Invalid Date",
      map: [["tick", "2"]],
      self: "[Circular]",
      set: ["3"],
    });
  });
});

function publishedEvents(): Array<{ detail?: unknown; name: string }> {
  return JSON.parse(
    document.documentElement.getAttribute(
      "data-modal-loading-latency-events",
    ) ?? "[]",
  );
}
