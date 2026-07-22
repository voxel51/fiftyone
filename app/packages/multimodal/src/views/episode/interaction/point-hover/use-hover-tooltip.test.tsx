import { act, render, renderHook, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Episode3dHoverTooltip,
  useEpisode3dHoverTooltip,
  type Episode3dHoveredEntity,
  type Episode3dHoveredPoint,
} from "./use-hover-tooltip";

const HOVERED_CAMERA = {
  calibrationStream: "/camera/front/camera_info",
  distortionModel: "plumb_bob",
  frameId: "camera_front",
  imageStream: "/camera/front/image",
  kind: "camera" as const,
  resolution: [1920, 1080] as const,
};

const HOVERED: Episode3dHoveredEntity = {
  entityId: "veh-12",
  kind: "entity",
  label: "car",
  stream: "/markers",
};

const HOVERED_POINT: Episode3dHoveredPoint = {
  fields: { intensity: 0.5, ring: 7 },
  frameId: "LIDAR_TOP",
  kind: "point",
  pointIndex: 42,
  position: [1, 2, 3],
  stream: "/lidar",
};

function pointerAt(x: number, y: number) {
  return { clientX: x, clientY: y } as React.PointerEvent;
}

describe("useEpisode3dHoverTooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the tooltip at the pointer after the dwell delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

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
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

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
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

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
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverEntity({
        entityId: "ped-3",
        kind: "entity",
        label: "pedestrian",
        stream: "/markers",
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

  it("shows point payloads immediately — their dwell already elapsed", () => {
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.containerProps.onPointerMove(pointerAt(40, 60));
      result.current.onHoverPoint(HOVERED_POINT);
    });
    expect(result.current.tooltip).toMatchObject({
      ...HOVERED_POINT,
      x: 40,
      y: 60,
    });

    act(() => {
      result.current.onHoverPoint(null);
    });
    expect(result.current.tooltip).toBeNull();
  });

  it("delays camera details and renders its association metadata", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.onHoverCamera(HOVERED_CAMERA);
      vi.advanceTimersByTime(120);
    });
    expect(result.current.tooltip).toMatchObject(HOVERED_CAMERA);

    const tooltip = result.current.tooltip;
    if (!tooltip) throw new Error("expected a camera tooltip");
    render(<Episode3dHoverTooltip tooltip={tooltip} />);
    expect(screen.getByText("/camera/front/image")).toBeTruthy();
    expect(screen.getByText("/camera/front/camera_info")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
  });

  it("does not let a pending entity replace a newer point tooltip", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverPoint(HOVERED_POINT);
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltip).toMatchObject(HOVERED_POINT);
  });

  it("preserves a pending entity dwell when point hover misses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverPoint(null);
      vi.advanceTimersByTime(70);
    });

    expect(result.current.tooltip).toMatchObject(HOVERED);
  });

  it("only clears tooltips of its own kind", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEpisode3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(120);
    });
    act(() => {
      result.current.onHoverPoint(null);
    });
    expect(result.current.tooltip).toMatchObject({ entityId: "veh-12" });

    act(() => {
      result.current.onHoverPoint(HOVERED_POINT);
    });
    act(() => {
      result.current.onHoverEntity(null);
    });
    expect(result.current.tooltip).toMatchObject({ pointIndex: 42 });
  });
});
