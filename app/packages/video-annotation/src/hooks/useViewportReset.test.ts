/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  dispatch: vi.fn(),
}));

vi.mock("@fiftyone/lighter", () => ({
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  useLighterEventHandler: () => (event: string, cb: () => void) => {
    hoisted.handlers.set(event, cb);
  },
  useLighterEventBus: () => ({ dispatch: hoisted.dispatch }),
  // The paint settle is synchronous here: the test is about when the
  // dispatch is allowed, not about the frame it lands on
  dispatchAfterPaintSettle: (_scene: unknown, cb: () => void) => cb(),
  useLighterSetupWithPixi: () => ({ scene: null }),
  useViewportInitReveal: () => false,
}));
vi.mock("@fiftyone/state", () => ({ useModalLookerOptions: () => ({}) }));
vi.mock("../../../core/src/components/Modal/Lighter/SharedCanvas", () => ({
  singletonCanvas: {},
}));
vi.mock("../media/ExternalCanonicalMedia", () => ({
  ExternalCanonicalMedia: class {},
}));
vi.mock("../state/accessors", () => ({
  useColorScheme: () => ({}),
  useColorSeed: () => 0,
}));

import { useViewportReset } from "./useLighterMediaScene";

const makeScene = (id: string) => ({
  getEventChannel: () => `channel-${id}`,
  getSceneId: () => id,
  resetZoomPan: vi.fn(),
});
type Scene = ReturnType<typeof makeScene>;

const fire = (event: string) => {
  act(() => hoisted.handlers.get(event)?.());
};

const render = (scene: Scene) =>
  renderHook(
    ({ scene, sceneId }: { scene: Scene; sceneId: string }) =>
      useViewportReset(scene as never, sceneId),
    { initialProps: { scene, sceneId: scene.getSceneId() } },
  );

describe("useViewportReset", () => {
  beforeEach(() => {
    hoisted.handlers.clear();
    hoisted.dispatch.mockClear();
  });

  it("resets and reveals once the renderer and media bounds are both ready", () => {
    const scene = makeScene("a");
    render(scene);

    fire("lighter:canonical-media-bounds-changed");
    expect(scene.resetZoomPan).not.toHaveBeenCalled();

    fire("lighter:renderer-ready");
    expect(scene.resetZoomPan).toHaveBeenCalledTimes(1);
    expect(hoisted.dispatch).toHaveBeenCalledWith(
      "lighter:viewport-init-complete",
      {},
    );
  });

  it("a re-minted scene waits for its own readiness", () => {
    const first = makeScene("a");
    const { rerender } = render(first);
    fire("lighter:renderer-ready");
    fire("lighter:canonical-media-bounds-changed");
    expect(hoisted.dispatch).toHaveBeenCalledTimes(1);

    // New source, new scene: the previous scene's readiness must not carry
    // over, or the cover drops before the new viewport has settled
    const second = makeScene("b");
    rerender({ scene: second, sceneId: "b" });
    expect(second.resetZoomPan).not.toHaveBeenCalled();
    expect(hoisted.dispatch).toHaveBeenCalledTimes(1);

    fire("lighter:renderer-ready");
    expect(second.resetZoomPan).not.toHaveBeenCalled();

    fire("lighter:canonical-media-bounds-changed");
    expect(second.resetZoomPan).toHaveBeenCalledTimes(1);
    expect(hoisted.dispatch).toHaveBeenCalledTimes(2);
  });
});
