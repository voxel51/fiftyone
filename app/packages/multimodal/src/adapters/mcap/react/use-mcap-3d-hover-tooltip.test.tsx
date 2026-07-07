import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMcap3dHoverTooltip } from "./use-mcap-3d-hover-tooltip";

const HOVERED = { entityId: "veh-12", label: "car", topic: "/markers" };

function pointerAt(x: number, y: number) {
  return { clientX: x, clientY: y } as React.PointerEvent;
}

describe("useMcap3dHoverTooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the tooltip at the pointer after the dwell delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMcap3dHoverTooltip());

    act(() => {
      result.current.containerProps.onPointerMove(pointerAt(120, 80));
      result.current.onHoverEntity(HOVERED);
    });
    expect(result.current.tooltip).toBeNull();

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(result.current.tooltip).toMatchObject({
      ...HOVERED,
      x: 120,
      y: 80,
    });
  });

  it("cancels a pending tooltip when the hover ends early", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMcap3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverEntity(null);
      vi.advanceTimersByTime(200);
    });
    expect(result.current.tooltip).toBeNull();
  });

  it("hides a shown tooltip when the pointer leaves the object", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMcap3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(120);
    });
    expect(result.current.tooltip).not.toBeNull();

    act(() => {
      result.current.onHoverEntity(null);
    });
    expect(result.current.tooltip).toBeNull();
  });

  it("re-arms the dwell when hopping between objects", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMcap3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverEntity({
        entityId: "ped-3",
        label: "pedestrian",
        topic: "/markers",
      });
      vi.advanceTimersByTime(80);
    });
    // 50 + 80 > delay, but the second hover restarted the clock.
    expect(result.current.tooltip).toBeNull();

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(result.current.tooltip).toMatchObject({ entityId: "ped-3" });
  });
});
