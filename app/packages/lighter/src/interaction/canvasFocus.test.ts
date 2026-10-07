/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * A press on the canvas ends text editing in a sidebar input. The pointer
 * handlers call preventDefault, which would otherwise keep the input focused
 * and route Delete/Backspace to it instead of the label shortcuts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Renderer2D } from "../renderer/Renderer2D";
import { SelectionManager } from "../selection/SelectionManager";
import { InteractionManager } from "./InteractionManager";

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  document.body.appendChild(canvas);
  return canvas;
};

const pointerDown = (canvas: HTMLCanvasElement, button = 0) => {
  canvas.dispatchEvent(
    new MouseEvent("pointerdown", {
      button,
      clientX: 10,
      clientY: 10,
      bubbles: true,
    }),
  );
};

describe("InteractionManager canvas focus", () => {
  let canvas: HTMLCanvasElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    canvas = makeCanvas();
    input = document.createElement("input");
    document.body.appendChild(input);
    new InteractionManager(
      canvas,
      new SelectionManager(`canvas-focus-test-${Math.random()}`),
      {
        getScale: () => 1,
        screenToWorld: (p: unknown) => p,
        disableZoomPan: vi.fn(),
      } as unknown as Renderer2D,
      `canvas-focus-test-${Math.random()}`,
    );
  });

  it("blurs a focused text input on a canvas press", () => {
    input.focus();
    expect(document.activeElement).toBe(input);

    pointerDown(canvas);

    expect(document.activeElement).not.toBe(input);
  });

  it("leaves a focused button alone", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    pointerDown(canvas);

    expect(document.activeElement).toBe(button);
  });

  it("ignores a right click", () => {
    input.focus();

    pointerDown(canvas, 2);

    expect(document.activeElement).toBe(input);
  });
});
