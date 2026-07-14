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
      PIXI.Graphics | undefined;
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
