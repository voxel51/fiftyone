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
import type { Selectable } from "../selection/Selectable";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import { DetectionOverlay } from "../overlay/DetectionOverlay";
import { Scene2D } from "../core/Scene2D";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
import {
  KeypointOverlay,
  type KeypointLabel,
} from "../overlay/KeypointOverlay";
import { MockRenderer2D } from "../renderer/MockRenderer2D";
import { GuidedKeypointHandler } from "./GuidedKeypointHandler";

/**
 * A keypoint overlay over an identity 100×100 media region, so the test
 * pointer at canvas (10, 10) lands on relative (0.1, 0.1).
 */
const makeKeypoint = (points: [number, number][]): KeypointOverlay => {
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });

  const overlay = new KeypointOverlay({
    id: "kp1",
    field: "keypoints",
    label: { label: "person", points } as KeypointLabel,
  });
  overlay.setRenderer(new MockRenderer2D());
  overlay.setCoordinateSystem(coordinateSystem);

  return overlay;
};

/** A stub overlay handler that hit-tests true everywhere. */
const makeHandler = (id: string) => {
  const onPointerDown = vi.fn(() => true);

  // `TypeGuards.isSelectable` probes for `id` / `isSelected` / `setSelected`
  // (Scene2D.ts:66) — a handler missing those is not selectable, and the
  // pan/zoom branch below would be skipped for the wrong reason.
  let selected = false;
  const handler: InteractionHandler = {
    id,
    containsPoint: () => true,
    onPointerDown,
    getSelectionPriority: () => 0,
    isSelected: () => selected,
    setSelected: (value: boolean) => {
      selected = value;
    },
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
  let disableZoomPan: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = makeCanvas();
    selection = new SelectionManager(`read-only-test-${Math.random()}`);
    disableZoomPan = vi.fn();
    manager = new InteractionManager(
      canvas,
      selection,
      {
        getScale: () => 1,
        screenToWorld: (p: unknown) => p,
        disableZoomPan,
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

  describe("camera", () => {
    // The guard here is the inverse of the others: read-only must NOT disable
    // pan/zoom. Bailing out of the drag without restoring the camera would
    // strand the gesture — the press neither moves the overlay nor pans, and
    // pan is only re-enabled on pointerup.
    it("leaves pan/zoom enabled when read-only", () => {
      const { handler } = makeHandler("d1");
      manager.addHandler(handler);
      manager.setReadOnly(true);

      pointerDown(canvas);

      expect(disableZoomPan).not.toHaveBeenCalled();
    });

    it("disables pan/zoom over a selectable overlay when editable", () => {
      const { handler } = makeHandler("d1");
      manager.addHandler(handler);
      manager.setReadOnly(false);

      pointerDown(canvas);

      expect(disableZoomPan).toHaveBeenCalled();
    });
  });

  // Explore is moving to Lighter, so keypoint placement and node drags are
  // part of the same safety property (review of the keypoint PR, 2026-09-30)
  describe("keypoint placement and node drags", () => {
    const hole: [number, number] = [NaN, NaN];

    it("never places a node when read-only", () => {
      const overlay = makeKeypoint([hole]);
      const onPlaced = vi.fn();
      manager.addHandler(
        new GuidedKeypointHandler(overlay, {
          getTargetIndex: () => 0,
          onPlaced,
        }),
      );
      manager.setReadOnly(true);

      pointerDown(canvas);

      expect(onPlaced).not.toHaveBeenCalled();
      expect(overlay.getRelativePoints()[0][0]).toBeNaN();
    });

    it("DOES place a node when editable", () => {
      const overlay = makeKeypoint([hole]);
      const onPlaced = vi.fn();
      manager.addHandler(
        new GuidedKeypointHandler(overlay, {
          getTargetIndex: () => 0,
          onPlaced,
        }),
      );
      manager.setReadOnly(false);

      pointerDown(canvas);

      expect(onPlaced).toHaveBeenCalledWith(0);
      expect(overlay.getRelativePoints()[0]).toEqual([0.1, 0.1]);
    });

    it("never hands a press on a placed node to the overlay when read-only", () => {
      const overlay = makeKeypoint([[0.1, 0.1]]);
      const onPointerDown = vi.spyOn(overlay, "onPointerDown");
      manager.addHandler(overlay);
      manager.setReadOnly(true);

      pointerDown(canvas);

      // the overlay's own pointer-down is what starts a node drag
      expect(onPointerDown).not.toHaveBeenCalled();
      expect(overlay.getRelativePoints()[0]).toEqual([0.1, 0.1]);
    });

    it("DOES hand a press on a placed node to the overlay when editable", () => {
      const overlay = makeKeypoint([[0.1, 0.1]]);
      const onPointerDown = vi.spyOn(overlay, "onPointerDown");
      manager.addHandler(overlay);
      manager.setReadOnly(false);

      pointerDown(canvas);

      expect(onPointerDown).toHaveBeenCalled();
    });
  });

  describe("Delete / Backspace on a sub-selected keypoint", () => {
    /** A handler that can mutate keypoint geometry, which read-only forbids. */
    const makeKeypointHandler = (id: string) => {
      const removePoint = vi.fn();
      let selected = false;
      const handler = {
        id,
        containsPoint: () => true,
        getSelectionPriority: () => 0,
        isSelected: () => selected,
        setSelected: (value: boolean) => {
          selected = value;
        },
        getSelectedPointIndex: () => 0,
        getPointCount: () => 3,
        removePoint,
      } as unknown as InteractionHandler;

      return { handler, removePoint };
    };

    const pressDelete = () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
      );

    it("refuses the removal when read-only", () => {
      const { handler, removePoint } = makeKeypointHandler("k1");
      manager.addHandler(handler);
      // `select` is a no-op for an overlay the manager doesn't know about
      selection.addSelectable(handler as unknown as Selectable);
      selection.select("k1");
      manager.setReadOnly(true);

      pressDelete();

      // `removePoint` mutates geometry on a surface with no way to save it
      expect(removePoint).not.toHaveBeenCalled();
    });

    it("performs the removal when editable", () => {
      const { handler, removePoint } = makeKeypointHandler("k1");
      manager.addHandler(handler);
      selection.addSelectable(handler as unknown as Selectable);
      selection.select("k1");
      manager.setReadOnly(false);

      pressDelete();

      expect(removePoint).toHaveBeenCalledWith(0);
    });
  });
});

/**
 * The presentation half: `InteractionManager` refuses the gesture, but
 * `DetectionOverlay` draws resize handles and a selection scrim off
 * `isDraggable || isResizeable`. Leaving those set would paint grab handles
 * for a drag that can never happen.
 */
describe("Scene2D read-only affordances", () => {
  const makeScene = () => {
    const canvas = document.createElement("canvas");
    return new Scene2D({
      canvas,
      renderer: {} as Renderer2D,
      resourceLoader: {} as ResourceLoader,
      sceneId: `read-only-scene-test-${Math.random()}`,
    });
  };

  const makeOverlay = (id: string) =>
    new DetectionOverlay({
      id,
      field: "frames.detections",
      label: { _id: id, label: "vehicle", bounding_box: [0, 0, 1, 1] },
    });

  it("reports the flag it was given", () => {
    const scene = makeScene();
    expect(scene.isReadOnly()).toBe(false);

    scene.setReadOnly(true);
    expect(scene.isReadOnly()).toBe(true);
  });

  it("strips move affordances from overlays already on the scene", () => {
    const scene = makeScene();
    const overlay = makeOverlay("d1");
    scene.addOverlay(overlay);

    scene.setReadOnly(true);

    expect(overlay.getDraggable()).toBe(false);
    expect(overlay.getResizeable()).toBe(false);
  });

  it("strips them from overlays added AFTER the scene went read-only", () => {
    // The video surface re-adds overlays on every frame, so applying the flag
    // only at `setReadOnly` time would leave every later frame draggable.
    const scene = makeScene();
    scene.setReadOnly(true);

    const overlay = makeOverlay("d1");
    scene.addOverlay(overlay);

    expect(overlay.getDraggable()).toBe(false);
    expect(overlay.getResizeable()).toBe(false);
  });

  it("strips the node-drag affordance from keypoint overlays", () => {
    const scene = makeScene();
    scene.setReadOnly(true);

    const overlay = makeKeypoint([[0.1, 0.1]]);
    scene.addOverlay(overlay);

    expect(overlay.getDraggable()).toBe(false);
  });

  it("leaves affordances alone on an editable scene", () => {
    const scene = makeScene();
    const overlay = makeOverlay("d1");
    scene.addOverlay(overlay);

    expect(overlay.getDraggable()).toBe(true);
  });
});
