import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
import { describe, expect, it, vi } from "vitest";

import { detectionAdapter, polylineAdapter } from "./adapters";
import { lighterAdapters } from "./adapters";
import { createLighterBridge } from "./lighterBridge";
import { makeDet, makeEngine, ref } from "../../testing/fixtures";

/** Minimal overlay shim covering everything the adapters/bridge touch. */
const makeOverlay = (
  id: string,
  field: string,
  label: Record<string, unknown>,
  extras: Record<string, unknown> = {}
) => ({
  id,
  field,
  label,
  isPersistent: true,
  applyLabel: vi.fn(function (this: { label: unknown }, next: unknown) {
    this.label = next as Record<string, unknown>;
  }),
  relativeBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  hasMask: () => false,
  getPendingMask: () => undefined,
  setSelected: vi.fn(),
  forceHoverEnter: vi.fn(),
  forceHoverLeave: vi.fn(),
  ...extras,
});

type Shim = ReturnType<typeof makeOverlay>;

const makeScene = () => {
  const overlays = new Map<string, Shim>();

  const scene = {
    getOverlay: (id: string) => overlays.get(id),
    getAllOverlays: () => [...overlays.values()],
    addOverlay: (overlay: Shim) => {
      overlays.set(overlay.id, overlay);
    },
    removeOverlay: (id: string) => {
      overlays.delete(id);
    },
  } as unknown as Scene2D;

  const overlayFactory = {
    create: vi.fn(
      (factoryKey: string, options: Record<string, unknown>) =>
        makeOverlay(
          options.id as string,
          options.field as string,
          options.label as Record<string, unknown>,
          { factoryKey }
        ) as unknown as BaseOverlay
    ),
  } as unknown as OverlayFactory;

  return { scene, overlays, overlayFactory };
};

describe("lighter adapters", () => {
  it("buildHandle stamps id = instanceId and maps bounding_box to rect", () => {
    const descriptor = detectionAdapter.buildHandle(ref("ground_truth", "d1"), {
      _id: "d1",
      label: "cat",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });

    expect(descriptor.factoryKey).toBe("detection");
    expect(descriptor.options.id).toBe("d1");
    expect(descriptor.options.field).toBe("ground_truth");
    expect(descriptor.options.relativeBounds).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
  });

  it("toLabel extracts bounds and strips _id (the ref owns identity)", () => {
    const overlay = makeOverlay("d1", "ground_truth", {
      _id: "d1",
      _cls: "Detection",
      label: "cat",
    });

    const partial = detectionAdapter.toLabel(overlay as unknown as BaseOverlay);

    expect(partial).toMatchObject({
      _cls: "Detection",
      label: "cat",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });
    expect(partial).not.toHaveProperty("_id");
    expect(partial).not.toHaveProperty("mask");
  });

  it("toLabel rejects invalid bounds", () => {
    const overlay = makeOverlay(
      "d1",
      "ground_truth",
      { _id: "d1" },
      { relativeBounds: { x: 0, y: 0, width: 0, height: 0 } }
    );

    expect(detectionAdapter.toLabel(overlay as unknown as BaseOverlay)).toBe(
      null
    );
  });

  it("toLabel persists a pending mask inline and nulls a stale mask_path", () => {
    const overlay = makeOverlay(
      "d1",
      "ground_truth",
      { _id: "d1", label: "cat", mask_path: "/m.png" },
      { hasMask: () => true, getPendingMask: () => "ENCODED" }
    );

    expect(
      detectionAdapter.toLabel(overlay as unknown as BaseOverlay)
    ).toMatchObject({ mask: "ENCODED", mask_path: null });
  });

  it("toLabel nulls the mask channel when a prior mask was removed", () => {
    const overlay = makeOverlay("d1", "ground_truth", {
      _id: "d1",
      mask: "OLD",
    });

    expect(
      detectionAdapter.toLabel(overlay as unknown as BaseOverlay)
    ).toMatchObject({ mask: null, mask_path: null });
  });

  it("polyline toLabel reads nested points and flags", () => {
    const overlay = makeOverlay(
      "p1",
      "polylines",
      { _id: "p1", label: "road" },
      {
        getNestedPoints: () => [
          [
            [0, 0],
            [1, 1],
          ],
        ],
        getClosed: () => true,
        getFilled: () => false,
      }
    );

    expect(polylineAdapter.toLabel(overlay as unknown as BaseOverlay)).toEqual({
      label: "road",
      points: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
      closed: true,
      filled: false,
    });
  });
});

describe("lighter bridge", () => {
  it("resolveHandle requires the field to match the ref path", () => {
    const { scene, overlays, overlayFactory } = makeScene();
    overlays.set("d1", makeOverlay("d1", "predictions", { _id: "d1" }));
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
    });

    expect(bridge.resolveHandle(ref("ground_truth", "d1"))).toBeUndefined();
    expect(bridge.resolveHandle(ref("predictions", "d1"))).toBeDefined();
  });

  it("clear removes only persistent overlays", () => {
    const { scene, overlays, overlayFactory } = makeScene();
    overlays.set("d1", makeOverlay("d1", "ground_truth", { _id: "d1" }));
    overlays.set(
      "cursor",
      makeOverlay("cursor", "", {}, { isPersistent: false })
    );
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
    });

    bridge.clear();

    expect(overlays.has("d1")).toBe(false);
    expect(overlays.has("cursor")).toBe(true);
  });

  it("drives the full engine read-half over a scene", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    // engine-shaped labels need bounds for the detection adapter
    engine.updateLabel(ref("ground_truth", "d1"), {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });

    const { scene, overlays, overlayFactory } = makeScene();
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
    });

    const unregister = engine.registerBridge(bridge, lighterAdapters);

    // hydration mounted via the factory with id = instanceId
    expect(overlays.get("d1")).toBeDefined();
    expect(overlays.get("d1")?.factoryKey).toBe("detection");

    // committed update applies silently
    engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    expect(overlays.get("d1")?.applyLabel).toHaveBeenCalled();

    // selection applies silently to the resolved overlay
    engine.interaction.setActive([ref("ground_truth", "d1")]);
    expect(overlays.get("d1")?.setSelected).toHaveBeenCalledWith(true);

    // hover
    engine.interaction.setHovered(ref("ground_truth", "d1"), true);
    expect(overlays.get("d1")?.forceHoverEnter).toHaveBeenCalled();

    // delete unmounts
    engine.deleteLabel(ref("ground_truth", "d1"));
    expect(overlays.has("d1")).toBe(false);

    unregister();
  });
});
