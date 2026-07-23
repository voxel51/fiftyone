import { act, render, renderHook, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Scene3dHoverTooltip,
  useScene3dHoverTooltip,
  type Scene3dHoveredEntity,
  type Scene3dHoveredPoint,
} from "./use-hover-tooltip";

const HOVERED_CAMERA = {
  calibrationAssociation: "Auto-matched" as const,
  calibrationSourceName: "/camera/front/camera_info",
  calibrationStream: "3",
  distortionModel: "plumb_bob",
  frameId: "camera_front",
  imageLabel: "camera/front/image",
  imageStream: "14",
  kind: "camera" as const,
  parentPosition: {
    kind: "resolved" as const,
    origin: [1.234, -0.082, 1.643] as const,
    parentFrameId: "base_link",
  },
  resolution: [1920, 1080] as const,
};

const HOVERED: Scene3dHoveredEntity = {
  entityId: "veh-12",
  kind: "entity",
  label: "car",
  metadata: {},
  stream: "/markers",
  texts: [],
};

const HOVERED_POINT: Scene3dHoveredPoint = {
  fields: { intensity: 0.5, ring: 7 },
  frameId: "LIDAR_TOP",
  kind: "point",
  pointIndex: 42,
  position: [1, 2, 3],
  sourceLabel: "lidar/top",
  sourceName: "/lidar/top/points",
  stream: "21",
};

function pointerAt(x: number, y: number) {
  return { clientX: x, clientY: y } as React.PointerEvent;
}

describe("useScene3dHoverTooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the tooltip at the pointer after the dwell delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

    act(() => {
      result.current.onHoverEntity(HOVERED);
      vi.advanceTimersByTime(50);
      result.current.onHoverEntity({
        ...HOVERED,
        entityId: "ped-3",
        label: "pedestrian",
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
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

    act(() => {
      result.current.onHoverCamera(HOVERED_CAMERA);
      vi.advanceTimersByTime(120);
    });
    expect(result.current.tooltip).toMatchObject(HOVERED_CAMERA);

    const tooltip = result.current.tooltip;
    if (!tooltip) throw new Error("expected a camera tooltip");
    render(<Scene3dHoverTooltip tooltip={tooltip} />);
    expect(screen.getByText("camera/front/image")).toBeTruthy();
    expect(screen.getByText("/camera/front/camera_info")).toBeTruthy();
    expect(screen.getByText("Auto-matched")).toBeTruthy();
    expect(screen.getByText("1920 × 1080")).toBeTruthy();
    expect(screen.getByText("Intrinsics source")).toBeTruthy();
    expect(screen.getByText("Position in parent (base_link)")).toBeTruthy();
    expect(screen.getByText("x +1.234 · y −0.082 · z +1.643 m")).toBeTruthy();
    expect(screen.queryByText("Image source")).toBeNull();
    expect(screen.queryByText("/camera/front/image")).toBeNull();
    expect(screen.queryByText("14")).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("keeps a camera dwell alive while its parent position updates", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScene3dHoverTooltip());

    act(() => {
      result.current.onHoverCamera(HOVERED_CAMERA);
      vi.advanceTimersByTime(50);
      result.current.onHoverCamera({
        ...HOVERED_CAMERA,
        parentPosition: {
          ...HOVERED_CAMERA.parentPosition,
          origin: [2.5, 3.5, 4.5],
        },
      });
      vi.advanceTimersByTime(60);
    });

    expect(result.current.tooltip).toMatchObject({
      kind: "camera",
      parentPosition: { origin: [2.5, 3.5, 4.5] },
    });

    act(() => {
      result.current.onHoverCamera({
        ...HOVERED_CAMERA,
        parentPosition: {
          ...HOVERED_CAMERA.parentPosition,
          origin: [5.5, 6.5, 7.5],
        },
      });
    });
    expect(result.current.tooltip).toMatchObject({
      parentPosition: { origin: [5.5, 6.5, 7.5] },
    });
  });

  it("renders an unavailable parent position honestly", () => {
    render(
      <Scene3dHoverTooltip
        tooltip={{
          ...HOVERED_CAMERA,
          frameId: undefined,
          parentPosition: {
            kind: "unavailable",
            reason: "Camera frame missing",
          },
          x: 0,
          y: 0,
        }}
      />,
    );
    expect(screen.getByText("Position in parent")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Reason · Camera frame missing")).toBeTruthy();
    expect(screen.queryByText("x +0.000 · y +0.000 · z +0.000 m")).toBeNull();
  });

  it("renders a point source name instead of its canonical id", () => {
    render(<Scene3dHoverTooltip tooltip={{ ...HOVERED_POINT, x: 0, y: 0 }} />);

    expect(screen.getByText("lidar/top")).toBeTruthy();
    expect(screen.getByText("/lidar/top/points")).toBeTruthy();
    expect(screen.queryByText("21")).toBeNull();
  });

  it("renders every scene text and metadata value for an entity", () => {
    const { getAllByText, getByText } = render(
      <Scene3dHoverTooltip
        tooltip={{
          ...HOVERED,
          entityId: "1721917734:3",
          label: "pedestrian",
          metadata: {
            classId: "pedestrian",
            score: "0.8100",
            source: "vision_msgs",
          },
          texts: ["pedestrian 0.81", "crossing"],
          x: 0,
          y: 0,
        }}
      />,
    );

    expect(getAllByText("pedestrian")).toHaveLength(2);
    expect(getByText("1721917734:3")).toBeTruthy();
    expect(getByText("pedestrian 0.81")).toBeTruthy();
    expect(getByText("crossing")).toBeTruthy();
    expect(getByText("Score")).toBeTruthy();
    expect(getByText("0.8100")).toBeTruthy();
    expect(getByText("Class ID")).toBeTruthy();
    expect(getByText("vision_msgs")).toBeTruthy();
  });

  it("does not let a pending entity replace a newer point tooltip", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
    const { result } = renderHook(() => useScene3dHoverTooltip());

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
