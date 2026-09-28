/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The render loop's phase contract.
 *
 * Pixi's `TickerPlugin` puts its own `render` on the ticker at
 * `UPDATE_PRIORITY.LOW`, behind the scene's handler at the default `NORMAL`,
 * so a ticker pass is meant to run "mutate the scene graph, then present it".
 * An `async` tick handler returns at its first `await` and finishes in a
 * microtask that drains after the ticker's synchronous phase — after Pixi has
 * already presented. Overlays paint by disposing their container and
 * rebuilding it, so a present landing in that window shows a hole: the flicker
 * this contract exists to prevent.
 *
 * These tests drive the handler the ticker would call and assert the frame is
 * COMPLETE when it returns — nothing deferred to a microtask.
 */

import { describe, expect, it, vi } from "vitest";

import { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import { Scene2D } from "./Scene2D";

const stubResourceLoader = {} as ResourceLoader;

/**
 * Records the order of renderer calls. Every overlay paints inside a rebuild
 * pass, so `begin` with no matching `end` inside the same tick is precisely
 * the window a present could catch mid-repaint.
 */
const makeRenderer = () => {
  const calls: string[] = [];
  let tick: (() => void) | undefined;

  const renderer = {
    calls,
    /** Invoke the handler exactly as Pixi's ticker would: synchronously. */
    fireTick: () => tick?.(),
    addTickHandler: (onFrame: () => void) => {
      tick = onFrame;
    },
    beginRebuild: (id: string) => calls.push(`begin:${id}`),
    endRebuild: (id: string) => calls.push(`end:${id}`),
    dispose: (id: string) => calls.push(`dispose:${id}`),
    drawRect: (_b: unknown, _s: unknown, id: string) =>
      calls.push(`draw:${id}`),
    drawLines: (_s: unknown, _st: unknown, id: string) =>
      calls.push(`draw:${id}`),
    drawText: (..._a: unknown[]) => undefined,
    drawScrim: (..._a: unknown[]) => undefined,
    drawImage: (..._a: unknown[]) => undefined,
    drawCircle: (..._a: unknown[]) => undefined,
    drawBoxes: (..._a: unknown[]) => undefined,
    show: () => undefined,
    hide: () => undefined,
    getScale: () => 1,
    isReady: () => true,
    getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
    hitTest: () => false,
  };

  return renderer as unknown as Renderer2D & {
    calls: string[];
    fireTick: () => void;
  };
};

const makeScene = (renderer: Renderer2D) =>
  new Scene2D({
    canvas: document.createElement("canvas"),
    renderer,
    resourceLoader: stubResourceLoader,
    sceneId: `render-frame-sync-test-${Math.random()}`,
  });

const makeDetection = (id: string) =>
  new DetectionOverlay({
    id,
    field: "frames.detections",
    label: { _id: id, label: "vehicle", bounding_box: [0, 0, 0.5, 0.5] },
    relativeBounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
  });

describe("Scene2D render loop phase contract", () => {
  it("paints every overlay within the tick, deferring nothing to a microtask", async () => {
    const renderer = makeRenderer();
    const scene = makeScene(renderer);
    await scene.startRenderLoop();

    scene.addOverlay(makeDetection("a"));
    scene.addOverlay(makeDetection("b"));

    renderer.fireTick();

    // the assertion that matters: the work is already done, BEFORE any
    // microtask has had a chance to run
    const duringTick = [...renderer.calls];
    expect(duringTick).toContain("begin:a");
    expect(duringTick).toContain("end:a");
    expect(duringTick).toContain("begin:b");
    expect(duringTick).toContain("end:b");

    // draining microtasks must add nothing — anything appearing here would be
    // a mutation Pixi's render for this pass could not have seen
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(renderer.calls).toEqual(duringTick);
  });

  it("closes every overlay's rebuild pass before the tick returns", () => {
    const renderer = makeRenderer();
    const scene = makeScene(renderer);
    scene.startRenderLoop();

    scene.addOverlay(makeDetection("a"));

    renderer.fireTick();

    // an open pass is the hole a present would catch: the container is
    // mid-repaint, with stale slots not yet trimmed
    const last = renderer.calls[renderer.calls.length - 1];
    expect(last).not.toBe("begin:a");
    expect(renderer.calls.indexOf("begin:a")).toBeLessThan(
      renderer.calls.indexOf("end:a"),
    );
    // and the overlay's own drawing happened between the two
    expect(renderer.calls.indexOf("begin:a")).toBeLessThan(
      renderer.calls.lastIndexOf("draw:a"),
    );
    expect(renderer.calls.lastIndexOf("draw:a")).toBeLessThan(
      renderer.calls.indexOf("end:a"),
    );
  });

  it("runs render callbacks in phase order, synchronously around the overlays", () => {
    const renderer = makeRenderer();
    const scene = makeScene(renderer);
    scene.startRenderLoop();

    scene.addOverlay(makeDetection("a"));

    const order: string[] = [];
    scene.registerRenderCallback({
      phase: "before",
      callback: () => order.push("before"),
    });
    scene.registerRenderCallback({
      phase: "after",
      callback: () => order.push("after"),
    });

    renderer.fireTick();

    // both phases have already run when the tick returns
    expect(order).toEqual(["before", "after"]);
  });

  it("closes an overlay's rebuild pass even when its paint throws", () => {
    // `executeOverlayRender` catches the error; an open pass would strand the
    // cursor and every slot past it until some later successful repaint
    const renderer = makeRenderer();
    const scene = makeScene(renderer);
    scene.startRenderLoop();

    const overlay = makeDetection("a");
    (overlay as unknown as { renderImpl: () => void }).renderImpl = () => {
      throw new Error("boom");
    };
    scene.addOverlay(overlay);

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => renderer.fireTick()).not.toThrow();

    expect(renderer.calls).toContain("begin:a");
    expect(renderer.calls).toContain("end:a");

    consoleError.mockRestore();
  });

  it("rejects an async render callback at the type level", () => {
    const renderer = makeRenderer();
    const scene = makeScene(renderer);

    scene.registerRenderCallback({
      phase: "after",
      // @ts-expect-error — a Promise-returning callback would suspend the
      // frame and reintroduce the phase inversion; `() => void` alone does
      // not reject it, so the guard lives on this signature.
      callback: async () => {
        await Promise.resolve();
      },
    });
  });

  it("keeps painting after a render callback throws", () => {
    const renderer = makeRenderer();
    const scene = makeScene(renderer);
    scene.startRenderLoop();

    scene.addOverlay(makeDetection("a"));

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    scene.registerRenderCallback({
      phase: "before",
      callback: () => {
        throw new Error("boom");
      },
    });

    expect(() => renderer.fireTick()).not.toThrow();
    expect(renderer.calls).toContain("begin:a");
    expect(renderer.calls).toContain("end:a");

    consoleError.mockRestore();
  });
});
