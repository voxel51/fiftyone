import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the playback timeline so the clock can be driven directly. `useFrameClock`
// only pulls `Clock` from @fiftyone/annotation as a type (erased), so no engine
// runtime is loaded here.
const { timeline } = vi.hoisted(() => ({
  timeline: {
    frame: 7,
    subscription: undefined as
      | undefined
      | { id: string; renderFrame: (n: number) => void },
    unsubscribed: [] as string[],
  },
}));

vi.mock("@fiftyone/playback", () => ({
  useTimeline: () => ({
    getFrameNumber: () => timeline.frame,
    subscribe: (sub: { id: string; renderFrame: (n: number) => void }) => {
      timeline.subscription = sub;
    },
    unsubscribe: (id: string) => {
      timeline.unsubscribed.push(id);
    },
  }),
}));

import { useFrameClock } from "./useFrameClock";

describe("useFrameClock", () => {
  it("reads the timeline frame as the engine clock time", () => {
    const { result } = renderHook(() => useFrameClock());

    expect(result.current.getTime()).toBe(7);

    timeline.frame = 9;
    expect(result.current.getTime()).toBe(9);
  });

  it("forwards frame ticks to the listener and unsubscribes on teardown", () => {
    const { result } = renderHook(() => useFrameClock());
    const listener = vi.fn();

    const teardown = result.current.subscribe(listener);
    expect(timeline.subscription).toBeDefined();

    timeline.subscription?.renderFrame(42);
    expect(listener).toHaveBeenCalledWith(42);

    teardown();
    expect(timeline.unsubscribed).toContain(timeline.subscription?.id);
  });
});
