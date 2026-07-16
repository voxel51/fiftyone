import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Drive the clock through the frame-source seam. `useFrameClock` only pulls
// `Clock` from @fiftyone/annotation as a type (erased), so no engine runtime is
// loaded here; the playback engine is represented by the seam's frame value.
const { source } = vi.hoisted(() => ({ source: { frame: 7 } }));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrame: () => source.frame,
}));

import { useFrameClock } from "./useFrameClock";

describe("useFrameClock", () => {
  it("reads the current frame as the engine clock time", () => {
    const { result, rerender } = renderHook(() => useFrameClock());

    expect(result.current.getTime()).toBe(7);

    source.frame = 9;
    rerender();
    expect(result.current.getTime()).toBe(9);
  });

  it("forwards frame changes to subscribers and stops on teardown", () => {
    const { result, rerender } = renderHook(() => useFrameClock());
    const listener = vi.fn();

    const teardown = result.current.subscribe(listener);

    source.frame = 42;
    rerender();
    expect(listener).toHaveBeenCalledWith(42);

    teardown();
    source.frame = 43;
    rerender();
    expect(listener).not.toHaveBeenCalledWith(43);
  });

  it("returns a stable clock across renders (attaches once)", () => {
    const { result, rerender } = renderHook(() => useFrameClock());
    const first = result.current;

    source.frame = 5;
    rerender();
    expect(result.current).toBe(first);
  });
});
