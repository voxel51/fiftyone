import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
import { decodeMaskPath } from "@fiftyone/lighter";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectionAdapter, polylineAdapter } from "./adapters";
import { lighterAdapters } from "./adapters";
import type { LighterBridgeDeps } from "./lighterBridge";
import { createLighterBridge } from "./lighterBridge";
import { makeDet, makeEngine, ref } from "../../testing/fixtures";

// the bridge's only runtime lighter import — everything else is type-only
vi.mock("@fiftyone/lighter", () => ({ decodeMaskPath: vi.fn() }));

type DecodedMask = Awaited<ReturnType<typeof decodeMaskPath>>;

const MASK = { shape: [2, 2] } as unknown as NonNullable<DecodedMask>;

const deferred = () => {
  let resolve!: (mask: DecodedMask) => void;
  const promise = new Promise<DecodedMask>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/** Drain microtasks so a resolved gate's continuation runs. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

/** Minimal overlay shim covering everything the adapters/bridge touch. */
const makeOverlay = (
  id: string,
  field: string,
  label: Record<string, unknown>,
  extras: Record<string, unknown> = {},
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
  const deselectOverlay = vi.fn();
  const selectOverlay = vi.fn();

  const scene = {
    getOverlay: (id: string) => overlays.get(id),
    getAllOverlays: () => [...overlays.values()],
    addOverlay: (overlay: Shim) => {
      overlays.set(overlay.id, overlay);
    },
    removeOverlay: (id: string) => {
      overlays.delete(id);
    },
    deselectOverlay,
    selectOverlay,
  } as unknown as Scene2D;

  const overlayFactory = {
    create: vi.fn(
      (factoryKey: string, options: Record<string, unknown>) =>
        makeOverlay(
          options.id as string,
          options.field as string,
          options.label as Record<string, unknown>,
          { factoryKey },
        ) as unknown as BaseOverlay,
    ),
  } as unknown as OverlayFactory;

  return { scene, overlays, overlayFactory, deselectOverlay, selectOverlay };
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

  it("buildHandle gates on mask_path only when no inline mask exists", () => {
    const gated = detectionAdapter.buildHandle(ref("ground_truth", "d1"), {
      _id: "d1",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      mask_path: "/m.png",
    });

    expect(gated.pendingMaskPath).toBe("/m.png");

    const inline = detectionAdapter.buildHandle(ref("ground_truth", "d1"), {
      _id: "d1",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      mask_path: "/m.png",
      mask: "INLINE",
    });

    expect(inline.pendingMaskPath).toBeUndefined();
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
      { relativeBounds: { x: 0, y: 0, width: 0, height: 0 } },
    );

    expect(detectionAdapter.toLabel(overlay as unknown as BaseOverlay)).toBe(
      null,
    );
  });

  it("toLabel persists a pending mask inline and nulls a stale mask_path", () => {
    const overlay = makeOverlay(
      "d1",
      "ground_truth",
      { _id: "d1", label: "cat", mask_path: "/m.png" },
      { hasMask: () => true, getPendingMask: () => "ENCODED" },
    );

    expect(
      detectionAdapter.toLabel(overlay as unknown as BaseOverlay),
    ).toMatchObject({ mask: "ENCODED", mask_path: null });
  });

  it("toLabel nulls the mask channel when a prior mask was removed", () => {
    const overlay = makeOverlay("d1", "ground_truth", {
      _id: "d1",
      mask: "OLD",
    });

    expect(
      detectionAdapter.toLabel(overlay as unknown as BaseOverlay),
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
      },
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
      readLabel: () => undefined,
    });

    expect(bridge.resolveHandle(ref("ground_truth", "d1"))).toBeUndefined();
    expect(bridge.resolveHandle(ref("predictions", "d1"))).toBeDefined();
  });

  it("clear removes only bridge-managed overlays", () => {
    const { scene, overlays, overlayFactory } = makeScene();
    // surface-owned transients the bridge never touched: the media image
    // plane and an uncommitted draft sharing the scene
    overlays.set("image", makeOverlay("image", "", {}));
    overlays.set(
      "draft",
      makeOverlay("draft", "ground_truth", { _id: "draft" }),
    );
    // a pre-existing committed overlay the loop adopts via resolveHandle
    overlays.set("d1", makeOverlay("d1", "ground_truth", { _id: "d1" }));
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
      readLabel: () => undefined,
    });

    bridge.mount(
      detectionAdapter.buildHandle(ref("ground_truth", "d2"), {
        _id: "d2",
        bounding_box: [0.1, 0.2, 0.3, 0.4],
      }),
    );
    bridge.resolveHandle(ref("ground_truth", "d1"));

    bridge.clear();

    expect(overlays.has("d1")).toBe(false);
    expect(overlays.has("d2")).toBe(false);
    expect(overlays.has("image")).toBe(true);
    expect(overlays.has("draft")).toBe(true);
  });

  it("drives the full engine read-half over a scene", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    // engine-shaped labels need bounds for the detection adapter
    engine.updateLabel(ref("ground_truth", "d1"), {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });

    const { scene, overlays, overlayFactory, selectOverlay } = makeScene();
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
      readLabel: (r) => engine.getLabel({ sample: "sample-1", ...r }),
    });

    const unregister = engine.registerBridge(bridge, lighterAdapters);

    // hydration mounted via the factory with id = instanceId
    expect(overlays.get("d1")).toBeDefined();
    expect(overlays.get("d1")?.factoryKey).toBe("detection");

    // committed update applies silently
    engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
    expect(overlays.get("d1")?.applyLabel).toHaveBeenCalled();

    // selection applies silently through the scene (flagged — real
    // SelectionManager state, so drag/resize affordances activate)
    engine.interaction.setActive([ref("ground_truth", "d1")]);
    expect(selectOverlay).toHaveBeenCalledWith("d1", {
      ignoreSideEffects: true,
    });

    // hover
    engine.interaction.setHovered(ref("ground_truth", "d1"), true);
    expect(overlays.get("d1")?.forceHoverEnter).toHaveBeenCalled();

    // delete unmounts
    engine.deleteLabel(ref("ground_truth", "d1"));
    expect(overlays.has("d1")).toBe(false);

    unregister();
  });

  it("unmount deselects with the side-effect flag before removal", () => {
    // a selected overlay's removal makes the scene's selection teardown emit
    // an unflagged deselect — inside the engine's dispatch window, a legacy
    // handler would write interaction state back (guard trip). The bridge
    // must deselect first, flagged.
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.updateLabel(ref("ground_truth", "d1"), {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });
    const { scene, overlays, overlayFactory, deselectOverlay } = makeScene();
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
      readLabel: (r) => engine.getLabel({ sample: "sample-1", ...r }),
    });
    engine.registerBridge(bridge, lighterAdapters);
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    engine.deleteLabel(ref("ground_truth", "d1"));

    expect(overlays.has("d1")).toBe(false);
    expect(deselectOverlay).toHaveBeenCalledWith("d1", {
      ignoreSideEffects: true,
    });
  });

  it("content scope: only labels meeting the 2D requirements mount", () => {
    // Detection3D shares `_cls` with Detection — the adapter's own
    // requirement (a 2D bounding box) is what keeps it off this surface
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [
          { ...makeDet("d2d", "cat"), bounding_box: [0.1, 0.2, 0.3, 0.4] },
          {
            ...makeDet("d3d", "car"),
            location: [0, 0, 0],
            dimensions: [1, 1, 1],
          },
          { ...makeDet("junk", "rat"), bounding_box: "not-a-box" },
        ],
      },
    });
    const { scene, overlays, overlayFactory } = makeScene();
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
      readLabel: (r) => engine.getLabel({ sample: "sample-1", ...r }),
    });

    engine.registerBridge(bridge, lighterAdapters);

    expect(overlays.has("d2d")).toBe(true);
    expect(overlays.has("d3d")).toBe(false);
    expect(overlays.has("junk")).toBe(false);
  });
});

describe("lighter bridge gated mounts (deferred mask_path decode)", () => {
  beforeEach(() => {
    vi.mocked(decodeMaskPath).mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  const det = (id: string, extras: Record<string, unknown> = {}) => ({
    _id: id,
    label: "cat",
    bounding_box: [0.1, 0.2, 0.3, 0.4],
    mask_path: "/m.png",
    ...extras,
  });

  const gatedDescriptor = (id = "d1", extras: Record<string, unknown> = {}) =>
    detectionAdapter.buildHandle(ref("ground_truth", id), det(id, extras));

  const makeGated = (overrides: Partial<LighterBridgeDeps> = {}) => {
    const parts = makeScene();
    const bridge = createLighterBridge({
      scene: parts.scene,
      overlayFactory: parts.overlayFactory,
      sample: "sample-1",
      readLabel: () => det("d1"),
      resolveMediaUrl: ({ raw }) => `http://x${raw}`,
      ...overrides,
    });
    return { ...parts, bridge };
  };

  it("defers the mount until the decode resolves — no maskless intermediate", async () => {
    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { bridge, overlays, overlayFactory } = makeGated();
    const onDeferredMount = vi.fn();
    bridge.onDeferredMount = onDeferredMount;

    const handle = bridge.mount(gatedDescriptor());

    expect(handle).toBeUndefined();
    expect(overlays.size).toBe(0);
    expect(bridge.resolveHandle(ref("ground_truth", "d1"))).toBeUndefined();

    gate.resolve(MASK);
    await settle();

    expect(overlays.get("d1")).toBeDefined();
    expect(overlayFactory.create).toHaveBeenCalledWith(
      "detection",
      expect.objectContaining({ preDecodedMask: MASK }),
    );
    expect(onDeferredMount).toHaveBeenCalledWith(overlays.get("d1"));
  });

  it("dedupes a re-fired mount while the decode is in flight", async () => {
    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { bridge, overlays } = makeGated();

    bridge.mount(gatedDescriptor());
    bridge.mount(gatedDescriptor()); // routine reconcile re-fire

    expect(decodeMaskPath).toHaveBeenCalledTimes(1);

    gate.resolve(MASK);
    await settle();

    expect(overlays.size).toBe(1);
  });

  it("discards a resolve whose ref no longer reads back", async () => {
    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { bridge, overlays } = makeGated({ readLabel: () => undefined });

    bridge.mount(gatedDescriptor());
    gate.resolve(MASK);
    await settle();

    expect(overlays.size).toBe(0);
  });

  it("clear() cancels in-flight gates (lifecycle teardown)", async () => {
    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { bridge, overlays } = makeGated();

    bridge.mount(gatedDescriptor());
    bridge.clear();
    gate.resolve(MASK);
    await settle();

    expect(overlays.size).toBe(0);
  });

  it("applies the freshest committed label at resolve time", async () => {
    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { bridge, overlays } = makeGated({
      // an update landed while the decode was in flight
      readLabel: () => det("d1", { label: "dog" }),
    });

    bridge.mount(gatedDescriptor());
    gate.resolve(MASK);
    await settle();

    const overlay = overlays.get("d1");
    expect(overlay?.applyLabel).toHaveBeenCalled();
    expect((overlay?.label as { label?: string }).label).toBe("dog");
  });

  it("re-decodes when the mask_path changes mid-flight", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(decodeMaskPath)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { bridge, overlays } = makeGated();

    bridge.mount(gatedDescriptor());
    bridge.mount(gatedDescriptor("d1", { mask_path: "/m2.png" }));

    first.resolve(MASK);
    await settle();

    // the stale decode was thrown away; a new one is in flight
    expect(overlays.size).toBe(0);
    expect(decodeMaskPath).toHaveBeenLastCalledWith(
      "http://x/m2.png",
      "ground_truth",
      expect.anything(),
    );

    second.resolve(MASK);
    await settle();

    expect(overlays.size).toBe(1);
  });

  it("mounts without a mask when no URL resolves (terminal fallback)", () => {
    const { bridge, overlays, overlayFactory } = makeGated({
      resolveMediaUrl: () => undefined,
    });

    bridge.mount(gatedDescriptor());

    expect(decodeMaskPath).not.toHaveBeenCalled();
    expect(overlays.get("d1")).toBeDefined();
    expect(overlayFactory.create).toHaveBeenCalledWith(
      "detection",
      expect.not.objectContaining({ preDecodedMask: expect.anything() }),
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("engine read-half gates hydration and applies interaction on the late insert", async () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.updateLabel(ref("ground_truth", "d1"), {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      mask_path: "/m.png",
    });

    const gate = deferred();
    vi.mocked(decodeMaskPath).mockReturnValue(gate.promise);
    const { scene, overlays, overlayFactory, selectOverlay } = makeScene();
    const bridge = createLighterBridge({
      scene,
      overlayFactory,
      sample: "sample-1",
      readLabel: (r) => engine.getLabel({ sample: "sample-1", ...r }),
      resolveMediaUrl: ({ raw }) => `http://x${raw}`,
    });

    const unregister = engine.registerBridge(bridge, lighterAdapters);

    // hydration is gated — nothing mounts until the decode lands
    expect(overlays.size).toBe(0);

    // selection arrives while the mount is in flight
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    gate.resolve(MASK);
    await settle();

    expect(overlays.get("d1")).toBeDefined();
    expect(selectOverlay).toHaveBeenCalledWith("d1", {
      ignoreSideEffects: true,
    });

    unregister();
  });
});
