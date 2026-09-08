import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePointerLockDrag } from "./usePointerLockDrag";

// A pointer-down event whose currentTarget can be pointer-locked.
function pointerDownEvent() {
  const el = document.createElement("div") as HTMLElement & {
    requestPointerLock: () => void;
  };
  el.requestPointerLock = vi.fn();
  return {
    preventDefault: vi.fn(),
    currentTarget: el,
  } as unknown as React.PointerEvent<HTMLElement>;
}

// Dispatch a pointermove on window with a real movement delta (jsdom drops
// movement* from fireEvent init, so define it on the event directly).
function move(axis: "movementX" | "movementY", value: number) {
  const ev = new MouseEvent("pointermove", { bubbles: true });
  Object.defineProperty(ev, axis, { value, configurable: true });
  act(() => {
    window.dispatchEvent(ev);
  });
}

function up() {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });
}

describe("usePointerLockDrag", () => {
  afterEach(() => {
    document.exitPointerLock = undefined as never;
  });

  it("treats a press-release with no movement as a click", () => {
    const onClick = vi.fn();
    const onDelta = vi.fn();
    const onDragStart = vi.fn();
    const { result } = renderHook(() =>
      usePointerLockDrag({ axis: "vertical", onDelta, onClick, onDragStart }),
    );

    act(() => result.current.handleProps.onPointerDown(pointerDownEvent()));
    up();

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("reports cumulative signed movement once past the threshold", () => {
    const onDelta = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onClick = vi.fn();
    const { result } = renderHook(() =>
      usePointerLockDrag({
        axis: "vertical",
        onDelta,
        onDragStart,
        onDragEnd,
        onClick,
      }),
    );

    act(() => result.current.handleProps.onPointerDown(pointerDownEvent()));
    move("movementY", -50);
    move("movementY", -30);
    up();

    expect(onDragStart).toHaveBeenCalledTimes(1);
    // Cumulative, not per-event: -50 then -80.
    expect(onDelta.mock.calls.map((c) => c[0])).toEqual([-50, -80]);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not report movement below the click threshold", () => {
    const onDelta = vi.fn();
    const onClick = vi.fn();
    const { result } = renderHook(() =>
      usePointerLockDrag({
        axis: "vertical",
        clickThreshold: 3,
        onDelta,
        onClick,
      }),
    );

    act(() => result.current.handleProps.onPointerDown(pointerDownEvent()));
    move("movementY", 2); // under threshold
    up();

    expect(onDelta).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reads the horizontal axis when requested", () => {
    const onDelta = vi.fn();
    const { result } = renderHook(() =>
      usePointerLockDrag({ axis: "horizontal", onDelta }),
    );

    act(() => result.current.handleProps.onPointerDown(pointerDownEvent()));
    move("movementX", 40);
    // A vertical move is ignored on the horizontal axis.
    move("movementY", 100);
    up();

    expect(onDelta.mock.calls.map((c) => c[0])).toEqual([40, 40]);
  });

  it("requests and exits pointer lock around a real drag", () => {
    const exitPointerLock = vi.fn();
    document.exitPointerLock = exitPointerLock;
    const { result } = renderHook(() =>
      usePointerLockDrag({ axis: "vertical", onDelta: vi.fn() }),
    );

    const evt = pointerDownEvent();
    act(() => result.current.handleProps.onPointerDown(evt));
    move("movementY", -50);
    expect(
      (evt.currentTarget as unknown as { requestPointerLock: () => void })
        .requestPointerLock,
    ).toHaveBeenCalledTimes(1);
    up();
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it("tracks isDragging across the drag", () => {
    const { result } = renderHook(() =>
      usePointerLockDrag({ axis: "vertical", onDelta: vi.fn() }),
    );

    expect(result.current.isDragging).toBe(false);
    act(() => result.current.handleProps.onPointerDown(pointerDownEvent()));
    move("movementY", -50);
    expect(result.current.isDragging).toBe(true);
    up();
    expect(result.current.isDragging).toBe(false);
  });
});
