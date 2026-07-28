import { act, renderHook } from "@testing-library/react-hooks";
import type { ThreeEvent } from "@react-three/fiber";
import { describe, expect, it } from "vitest";
import { useDragGate } from "./useDragGate";

function pointerEvent(clientX: number, clientY: number) {
  return { nativeEvent: { clientX, clientY } } as ThreeEvent<PointerEvent>;
}

describe("useDragGate", () => {
  it("reports a click when the pointer doesn't move past the threshold", () => {
    const { result } = renderHook(() => useDragGate({ dragThresholdPx: 4 }));

    act(() => {
      result.current.onPointerDown(pointerEvent(100, 100));
      result.current.onPointerMove(pointerEvent(102, 100));
      result.current.onPointerUp(pointerEvent(102, 100));
    });

    expect(result.current.isClick()).toBe(true);
  });

  it("reports a drag once movement exceeds the threshold", () => {
    const { result } = renderHook(() => useDragGate({ dragThresholdPx: 4 }));

    act(() => {
      result.current.onPointerDown(pointerEvent(100, 100));
      result.current.onPointerMove(pointerEvent(110, 100));
    });

    expect(result.current.isClick()).toBe(false);
  });

  it("resets drag state on the next pointer-down", () => {
    const { result } = renderHook(() => useDragGate({ dragThresholdPx: 4 }));

    act(() => {
      result.current.onPointerDown(pointerEvent(100, 100));
      result.current.onPointerMove(pointerEvent(110, 100));
      result.current.onPointerUp(pointerEvent(110, 100));
    });
    expect(result.current.isClick()).toBe(false);

    act(() => {
      result.current.onPointerDown(pointerEvent(200, 200));
    });

    expect(result.current.isClick()).toBe(true);
  });

  it("ignores movement before any pointer-down", () => {
    const { result } = renderHook(() => useDragGate({ dragThresholdPx: 4 }));

    act(() => {
      result.current.onPointerMove(pointerEvent(500, 500));
    });

    expect(result.current.isClick()).toBe(true);
  });

  it("uses the default threshold when none is provided", () => {
    const { result } = renderHook(() => useDragGate());

    act(() => {
      result.current.onPointerDown(pointerEvent(0, 0));
      result.current.onPointerMove(pointerEvent(1, 0));
    });

    expect(result.current.isClick()).toBe(true);
  });
});
