/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Rect } from "../types";
import { PixiRenderer2D } from "./PixiRenderer2D";

// Wire up a renderer without booting WebGL; initializePixiJS normally makes these.
const makeRenderer = () => {
  const renderer = new PixiRenderer2D(document.createElement("canvas"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internal = renderer as any;
  internal.foregroundContainer = new PIXI.Container();
  internal.backgroundContainer = new PIXI.Container();
  return { renderer, internal };
};

const BOUNDS: Rect = { x: 0, y: 0, width: 8, height: 8 };

describe("PixiRenderer2D mask texture lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retain canvas textures in PIXI's global cache", () => {
    const { renderer } = makeRenderer();
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;

    renderer.drawImage(
      { type: "canvas", canvas },
      BOUNDS,
      { opacity: 1 },
      "c1",
    );

    // Canvas path must bypass PIXI's global cache (else textures accumulate).
    expect(PIXI.Cache.has(canvas)).toBe(false);
  });

  it("tracks the canvas texture as owned by its container", () => {
    const { renderer, internal } = makeRenderer();
    const canvas = document.createElement("canvas");

    renderer.drawImage(
      { type: "canvas", canvas },
      BOUNDS,
      { opacity: 1 },
      "c1",
    );

    expect(internal.ownedTextures.get("c1")).toHaveLength(1);
  });

  it("destroys owned textures on dispose so they cannot accumulate", () => {
    const { renderer, internal } = makeRenderer();
    const canvas = document.createElement("canvas");

    renderer.drawImage(
      { type: "canvas", canvas },
      BOUNDS,
      { opacity: 1 },
      "c1",
    );
    const texture = internal.ownedTextures.get("c1")[0] as PIXI.Texture;
    const destroySpy = vi.spyOn(texture, "destroy");

    renderer.dispose("c1");

    expect(destroySpy).toHaveBeenCalledWith(true);
    expect(internal.ownedTextures.has("c1")).toBe(false);
  });

  it("does not grow owned-texture bookkeeping across repeated render frames", () => {
    const { renderer, internal } = makeRenderer();

    // Per-frame render cycle during sustained brushing.
    for (let frame = 0; frame < 50; frame++) {
      renderer.dispose("c1");
      const canvas = document.createElement("canvas");
      renderer.drawImage(
        { type: "canvas", canvas },
        BOUNDS,
        { opacity: 1 },
        "c1",
      );
    }

    // Only the current frame's texture is retained, not one per frame.
    expect(internal.ownedTextures.get("c1")).toHaveLength(1);
  });

  it("destroys and clears owned textures on cleanUp", () => {
    const { renderer, internal } = makeRenderer();
    renderer.drawImage(
      { type: "canvas", canvas: document.createElement("canvas") },
      BOUNDS,
      { opacity: 1 },
      "c1",
    );

    const texture = internal.ownedTextures.get("c1")[0] as PIXI.Texture;
    const destroySpy = vi.spyOn(texture, "destroy");

    // cleanUp bails early unless the pixi app exists; stub what it touches.
    internal.app = { stop: () => {}, stage: { removeChildren: () => {} } };
    renderer.cleanUp();

    expect(destroySpy).toHaveBeenCalledWith(true);
    expect(internal.ownedTextures.size).toBe(0);
  });
});

describe("PixiRenderer2D graphics context lifecycle", () => {
  const STYLE = { strokeStyle: "#ffffff", lineWidth: 1 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("destroys each Graphics' owned context on dispose", () => {
    const { renderer, internal } = makeRenderer();

    renderer.drawRect(BOUNDS, STYLE, "c1");

    const graphics = internal.containers
      .get("c1")
      .children.find((c: PIXI.Container) => c instanceof PIXI.Graphics) as
      | PIXI.Graphics
      | undefined;
    expect(graphics).toBeDefined();

    // The GraphicsContext is freed only when destroy is called with context: true.
    const contextDestroy = vi.spyOn(graphics!.context, "destroy");

    renderer.dispose("c1");

    expect(contextDestroy).toHaveBeenCalled();
    expect(graphics!.destroyed).toBe(true);
  });

  it("does not retain graphics across repeated dispose+draw frames", () => {
    const { renderer, internal } = makeRenderer();

    for (let frame = 0; frame < 50; frame++) {
      renderer.dispose("c1");
      renderer.drawRect(BOUNDS, STYLE, "c1");
    }

    // Each frame fully tears down the prior container, so exactly one lives.
    expect(internal.containers.size).toBe(1);
    expect(internal.containers.get("c1").children).toHaveLength(1);
  });
});

describe("PixiRenderer2D slot reuse", () => {
  const STYLE = { strokeStyle: "#ffffff", lineWidth: 1 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const childrenOf = (internal: any, id: string): PIXI.Container[] =>
    internal.containers.get(id).children;

  it("repaints into the same display objects across passes", () => {
    const { renderer, internal } = makeRenderer();

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    const first = [...childrenOf(internal, "c1")];
    expect(first).toHaveLength(2);

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    const second = childrenOf(internal, "c1");
    expect(second).toHaveLength(2);
    // the point of the whole change: same objects, not replacements
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(first[0].destroyed).toBe(false);
  });

  it("clears reused geometry so a pass never inherits the last one's shapes", () => {
    const { renderer, internal } = makeRenderer();

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    const graphics = childrenOf(internal, "c1")[0] as PIXI.Graphics;
    const clear = vi.spyOn(graphics, "clear");

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    expect(clear).toHaveBeenCalled();
  });

  it("trims the slots a shorter pass does not reach", () => {
    const { renderer, internal } = makeRenderer();

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    const stale = childrenOf(internal, "c1")[2];

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    expect(childrenOf(internal, "c1")).toHaveLength(1);
    expect(stale.destroyed).toBe(true);
  });

  it("restores eventMode on reuse, so a scrim's slot stays hit-testable", () => {
    const { renderer, internal } = makeRenderer();

    // pass 1: a scrim, which opts itself out of hit-testing
    renderer.beginRebuild("c1");
    renderer.drawScrim(BOUNDS, BOUNDS, "c1");
    renderer.endRebuild("c1");

    expect(childrenOf(internal, "c1")[0].eventMode).toBe("none");

    // pass 2: an ordinary rect claims that same slot
    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    // inheriting "none" would leave the overlay permanently unclickable
    expect(childrenOf(internal, "c1")[0].eventMode).not.toBe("none");
  });

  it("swaps in place when a slot's object type changes", () => {
    const { renderer, internal } = makeRenderer();

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.endRebuild("c1");

    const trailing = childrenOf(internal, "c1")[1];

    // second slot is a Sprite this time; the first stays a Graphics
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;

    renderer.beginRebuild("c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawImage({ type: "canvas", canvas }, BOUNDS, undefined, "c1");
    renderer.endRebuild("c1");

    const children = childrenOf(internal, "c1");
    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(PIXI.Graphics);
    expect(children[1]).toBeInstanceOf(PIXI.Sprite);
    expect(trailing.destroyed).toBe(true);
  });

  it("keeps drawText's background beneath its glyphs", () => {
    const { renderer, internal } = makeRenderer();

    // glyph measurement needs a real 2D context, which jsdom lacks; the
    // geometry is irrelevant here, only which slot each object lands in
    vi.spyOn(PIXI.Text.prototype, "getLocalBounds").mockReturnValue({
      width: 10,
      height: 10,
    } as never);

    renderer.beginRebuild("c1");
    renderer.drawText(
      "hi",
      { x: 0, y: 0 },
      { backgroundColor: "#000000" },
      "c1",
    );
    renderer.endRebuild("c1");

    // slot order is z-order: background first, then the text on top
    const children = childrenOf(internal, "c1");
    expect(children[0]).toBeInstanceOf(PIXI.Graphics);
    expect(children[children.length - 1]).toBeInstanceOf(PIXI.Text);
  });

  it("keeps nested passes independent, so a sub-overlay cannot disturb its parent", () => {
    // DetectionOverlay paints its MaskKeypoints from inside its own pass; the
    // two hold different container ids, and each cursor is keyed by id
    const { renderer, internal } = makeRenderer();

    renderer.beginRebuild("parent");
    renderer.drawRect(BOUNDS, STYLE, "parent");

    renderer.beginRebuild("child");
    renderer.drawRect(BOUNDS, STYLE, "child");
    renderer.endRebuild("child");

    // the parent's cursor survived the nested pass: this is its second slot,
    // not a reuse of its first
    renderer.drawRect(BOUNDS, STYLE, "parent");
    renderer.endRebuild("parent");

    expect(childrenOf(internal, "parent")).toHaveLength(2);
    expect(childrenOf(internal, "child")).toHaveLength(1);
  });

  it("appends when no rebuild pass is open, as it did before pooling", () => {
    const { renderer, internal } = makeRenderer();

    renderer.drawRect(BOUNDS, STYLE, "c1");
    renderer.drawRect(BOUNDS, STYLE, "c1");

    expect(childrenOf(internal, "c1")).toHaveLength(2);
  });

  it("holds one container and one child across many repaint passes", () => {
    const { renderer, internal } = makeRenderer();

    for (let frame = 0; frame < 50; frame++) {
      renderer.beginRebuild("c1");
      renderer.drawRect(BOUNDS, STYLE, "c1");
      renderer.endRebuild("c1");
    }

    expect(internal.containers.size).toBe(1);
    expect(childrenOf(internal, "c1")).toHaveLength(1);
  });
});
