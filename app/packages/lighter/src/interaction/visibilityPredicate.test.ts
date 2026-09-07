/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The hit-testing half of label visibility, driven through the real event
 * wiring — same reason and same shape as `readOnly.test.ts` beside this file:
 * `Scene2D.shouldShowOverlay` stops PAINTING a filtered-out label, but
 * painting and hit-testing are separate systems (this manager has no
 * reference back to the scene), so without a predicate here a label the
 * sidebar just hid would still be clickable at its last drawn position.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InteractionManager,
  type InteractionHandler,
} from "./InteractionManager";
import { SelectionManager } from "../selection/SelectionManager";
import type { Renderer2D } from "../renderer/Renderer2D";

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
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  return canvas;
};

const pointerDown = (canvas: HTMLCanvasElement) => {
  canvas.dispatchEvent(
    new MouseEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }),
  );
};

describe("InteractionManager visibility predicate", () => {
  let canvas: HTMLCanvasElement;
  let manager: InteractionManager;

  beforeEach(() => {
    canvas = makeCanvas();
    manager = new InteractionManager(
      canvas,
      new SelectionManager(`visibility-test-${Math.random()}`),
      {
        getScale: () => 1,
        screenToWorld: (p: unknown) => p,
      } as unknown as Renderer2D,
      `visibility-test-${Math.random()}`,
    );
  });

  it("skips a handler the predicate marks hidden", () => {
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);
    manager.setVisibilityPredicate((id) => id !== "d1");

    pointerDown(canvas);

    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("still hit-tests a handler the predicate marks visible", () => {
    // The negative above is only meaningful against this: without it, a
    // predicate that unconditionally returns false would pass either way.
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);
    manager.setVisibilityPredicate((id) => id === "d1");

    pointerDown(canvas);

    expect(onPointerDown).toHaveBeenCalled();
  });

  it("hit-tests normally when no predicate is set", () => {
    // Every existing caller (image annotate, anything that never opts into
    // filtering) never calls `setVisibilityPredicate` at all — this is the
    // backward-compatible default the whole feature has to preserve.
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);

    pointerDown(canvas);

    expect(onPointerDown).toHaveBeenCalled();
  });

  it("clearing the predicate restores normal hit-testing", () => {
    const { handler, onPointerDown } = makeHandler("d1");
    manager.addHandler(handler);
    manager.setVisibilityPredicate(() => false);
    manager.setVisibilityPredicate(undefined);

    pointerDown(canvas);

    expect(onPointerDown).toHaveBeenCalled();
  });
});
