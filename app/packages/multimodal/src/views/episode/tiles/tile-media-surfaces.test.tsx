import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useTileMediaSurfaces,
  type TileMediaSurface,
} from "../../../extensions/tiles/media-surfaces";
import type { SceneSource } from "../../../scene-inventory";
import {
  useRegisterTileMediaSurface,
  type TileMediaSurfaceConfig,
} from "./tile-media-surfaces";

function imageSource(id: string): SceneSource {
  return { id, label: id.toUpperCase(), sourceName: id, type: "image" };
}

/** An element whose layout box the test controls (jsdom reports zeros). */
function fakeViewport(width: number, height: number): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }) as DOMRect;
  return el;
}

const Registrar: React.FC<{ config: TileMediaSurfaceConfig }> = ({
  config,
}) => {
  useRegisterTileMediaSurface(config);
  return null;
};

const baseConfig = (element: HTMLElement): TileMediaSurfaceConfig => ({
  element,
  source: imageSource("cam_front"),
  imageSize: { width: 1000, height: 500 },
  fit: "contain",
  viewTransform: { scale: 1, translateX: 0, translateY: 0 },
  contentTimeNs: 42n,
});

/** A registering tile plus a sibling consumer in the same tiling store. */
function harness(config: TileMediaSurfaceConfig) {
  const surfaces: TileMediaSurface[] = [];
  const Capture: React.FC = () => {
    const current = useTileMediaSurfaces();
    surfaces.length = 0;
    surfaces.push(...current);
    return null;
  };
  const ui = (cfg: TileMediaSurfaceConfig) => (
    <TilingProvider>
      <TileIdScope tileId="image-1">
        <Registrar config={cfg} />
      </TileIdScope>
      <Capture />
    </TilingProvider>
  );
  const view = render(ui(config));
  return {
    surfaces,
    rerender: (cfg: TileMediaSurfaceConfig) => view.rerender(ui(cfg)),
  };
}

describe("useRegisterTileMediaSurface", () => {
  afterEach(cleanup);

  it("publishes the tile's semantic identity while bound, cleans up when unbound", () => {
    const element = fakeViewport(200, 200);
    const { surfaces, rerender } = harness(baseConfig(element));
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({
      tileId: "image-1",
      source: { type: "image", name: "cam_front" },
      element,
    });

    rerender({ ...baseConfig(element), source: null });
    expect(surfaces).toHaveLength(0);
  });

  it("computes the letterboxed media rect through the pan/zoom transform", () => {
    // 1000×500 media contained in a 200×200 viewport → 200×100 at y=50.
    const { surfaces } = harness(baseConfig(fakeViewport(200, 200)));
    expect(surfaces[0].getMediaRect()).toEqual({
      left: 0,
      top: 50,
      width: 200,
      height: 100,
    });
  });

  it("returns no rect before the media has loaded", () => {
    const { surfaces } = harness({
      ...baseConfig(fakeViewport(200, 200)),
      imageSize: null,
    });
    expect(surfaces[0].getMediaRect()).toBeNull();
  });

  it("reads per-frame values through the live config, not the mount-time one", () => {
    const element = fakeViewport(200, 200);
    const config = baseConfig(element);
    const { surfaces, rerender } = harness(config);
    const surface = surfaces[0];
    expect(surface.getContentTimeNs()).toBe(42n);

    // A 2× zoom re-renders the tile; the SAME surface object must see it.
    rerender({
      ...config,
      contentTimeNs: 99n,
      viewTransform: { scale: 2, translateX: 10, translateY: 0 },
    });
    expect(surfaces[0]).toBe(surface);
    expect(surface.getContentTimeNs()).toBe(99n);
    expect(surface.getMediaRect()).toEqual({
      // contain rect (0, 50, 200×100) scaled 2× about its center, +10px x.
      left: -90,
      top: 0,
      width: 400,
      height: 200,
    });
  });
});
