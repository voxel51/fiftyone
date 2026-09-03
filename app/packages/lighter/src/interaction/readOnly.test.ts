/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The read-only lock, driven through the real event wiring.
 *
 * This is the safety property the Explore video surface rests on: it paints
 * labels it has no way to save, so a stray drag must not be able to commit a
 * silent edit. The lock is enforced at the one point where a pointer-down
 * hands control to an overlay's own handler, so these tests dispatch actual
 * `pointerdown` events at the canvas rather than calling an internal method —
 * deleting the guard has to make them fail.
 *
 * Selection is deliberately NOT locked — clicking a label in Explore is the
 * whole point, it just must not move anything — but that half is not asserted
 * here: it needs an overlay registered as a `Selectable` with the scene, which
 * is a `Scene2D`-level fixture rather than a bare `InteractionManager`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InteractionManager,
  type InteractionHandler,
} from "./InteractionManager";
import { SelectionManager } from "../selection/SelectionManager";
import type { Renderer2D } from "../renderer/Renderer2D";

/** A stub overlay handler that hit-tests true everywhere. */
const makeHandler = (id: string) => {
  const onPointerDown = vi.fn(() => true);

  const handler: InteractionHandler = {
    id,
    containsPoint: () => true,
    onPointerDown,
    getSelectionPriority: () => 0,
    isSelectable: () => true,
  } as unknown as InteractionHandler;

  return { handler, onPointerDown };
};

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");

  // jsdom implements neither of these, and the manager calls both on the
  // paths under test.
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;

  return canvas;
};

const pointerDown = (canvas: HTMLCanvasElement) => {
  canvas.dispatchEvent(
    new MouseEvent("pointerdown", {
      clientX: 10,
      clientY: 10,
      bubbles: true,
    }),
  );
};

describe("InteractionManager read-only", () => {
  let canvas: HTMLCanvasElement;
  let selection: SelectionManager;
  let manager: InteractionManager;

  beforeEach(() => {
    canvas = makeCanvas();
    selection = new SelectionManager(`read-only-test-${Math.random()}`);
    manager = new InteractionManager(
      canvas,
      selection,
      {
        getScale: () => 1,
        screenToWorld: (p: unknown) => p,
      } as unknown as Renderer2D,
      `read-only-test-${Math.random()}`,
    );
  });

  it("reports the flag it was given", () => {
    expect(manager.isReadOnly()).toBe(false);

    manager.setReadOnly(true);
    expect(manager.isReadOnly()).toBe(true);

    manager.setReadOnly(false);
    expect(manager.isReadOnly()).toBe(false);
  });

  it("does not hand the pointer to an overlay when read-only", () => {
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);
    manager.setReadOnly(true);

    pointerDown(canvas);

    // The overlay's own handler is what puts it into DRAGGING / RESIZE, so
    // never reaching it is the lock.
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("DOES hand the pointer to an overlay when not read-only", () => {
    // The negative above is only meaningful against this: without it, a test
    // that never wires the handler up correctly would pass either way.
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);
    manager.setReadOnly(false);

    pointerDown(canvas);

    expect(onPointerDown).toHaveBeenCalled();
  });
});
