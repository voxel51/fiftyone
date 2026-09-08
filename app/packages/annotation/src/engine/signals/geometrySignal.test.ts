import { describe, expect, it, vi } from "vitest";

import { createUndoNavigator, makeEngine, ref } from "../testing/fixtures";
import { encodeEntityId } from "../identity/entityId";
import { GEOMETRY_SIGNAL, type GeometrySignal } from "./geometry";

const DATASET = "dataset-1";

const cuboidSample = {
  ground_truth: {
    _cls: "Detections",
    detections: [
      {
        _id: "c1",
        _cls: "Detection",
        label: "car",
        location: [1, 2, 3],
        dimensions: [4, 5, 6],
        rotation: [0, 0, 0],
      },
    ],
  },
};

const c1 = ref("ground_truth", "c1");
const c1Key = encodeEntityId(DATASET, c1);

const geom = (
  location: [number, number, number],
  dimensions: [number, number, number] = [4, 5, 6],
): GeometrySignal => ({
  kind: "3d",
  location,
  dimensions,
  quaternion: [0, 0, 0, 1],
});

describe("geometry signal pipe", () => {
  it("delivers a published payload to the matching entity subscriber only", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const mine = vi.fn();
    const other = vi.fn();

    engine.subscribeSignal<GeometrySignal>(GEOMETRY_SIGNAL, c1Key, mine);
    engine.subscribeSignal<GeometrySignal>(
      GEOMETRY_SIGNAL,
      encodeEntityId(DATASET, ref("ground_truth", "other")),
      other,
    );

    engine.publishSignal<GeometrySignal>(
      GEOMETRY_SIGNAL,
      c1Key,
      geom([9, 9, 9]),
    );

    expect(mine).toHaveBeenCalledTimes(1);
    expect(mine).toHaveBeenCalledWith(geom([9, 9, 9]), c1Key);
    expect(other).not.toHaveBeenCalled();
  });

  it("has no retention: a late subscriber sees only future publishes", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);

    engine.publishSignal<GeometrySignal>(
      GEOMETRY_SIGNAL,
      c1Key,
      geom([9, 9, 9]),
    );

    const late = vi.fn();
    engine.subscribeSignal<GeometrySignal>(GEOMETRY_SIGNAL, c1Key, late);
    expect(late).not.toHaveBeenCalled();

    engine.publishSignal<GeometrySignal>(
      GEOMETRY_SIGNAL,
      c1Key,
      geom([8, 8, 8]),
    );
    expect(late).toHaveBeenCalledWith(geom([8, 8, 8]), c1Key);
  });

  it("a signal is not an edit: publishing dispatches no change and pushes no undo entry", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const onChange = vi.fn();
    const onCommit = vi.fn();
    engine.subscribe(onChange);
    engine.subscribeUndoableCommit(onCommit);

    engine.publishSignal<GeometrySignal>(
      GEOMETRY_SIGNAL,
      c1Key,
      geom([9, 9, 9]),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    // committed truth untouched
    expect(engine.getLabel(c1)?.location).toEqual([1, 2, 3]);
  });
});

describe("3D drag gesture: signals mid-drag, one atomic commit at mouseup", () => {
  /**
   * Models the surface's gesture lifecycle exactly as `useCuboidAnnotation` +
   * `operations.ts` drive it: mousedown starts a drag (no engine traffic),
   * every transform tick publishes ABSOLUTE geometry on the signal pipe
   * (render-only), and mouseup commits the final geometry in ONE engine
   * transaction — one undo unit.
   */
  const dragGesture = (
    engine: ReturnType<typeof makeEngine>["engine"],
    ticks: [number, number, number][],
  ) => {
    for (const location of ticks) {
      engine.publishSignal<GeometrySignal>(
        GEOMETRY_SIGNAL,
        c1Key,
        geom(location),
      );
    }

    const final = ticks[ticks.length - 1];
    engine.transaction(() => {
      engine.updateLabel(c1, { location: final });
    });
  };

  it("mid-drag ticks reach observers but never the engine; mouseup commits once", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const observer = vi.fn();
    const onCommit = vi.fn();
    engine.subscribeSignal<GeometrySignal>(GEOMETRY_SIGNAL, c1Key, observer);
    engine.subscribeUndoableCommit(onCommit);

    dragGesture(engine, [
      [2, 2, 3],
      [3, 2, 3],
      [4, 2, 3],
    ]);

    // observers saw every tick
    expect(observer).toHaveBeenCalledTimes(3);
    expect(observer).toHaveBeenLastCalledWith(geom([4, 2, 3]), c1Key);
    // the engine saw exactly one undoable commit, at mouseup
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(engine.getLabel(c1)?.location).toEqual([4, 2, 3]);
  });

  it("undo/redo treat the whole gesture as one unit", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const nav = createUndoNavigator(engine);

    dragGesture(engine, [
      [2, 2, 3],
      [5, 2, 3],
    ]);

    expect(nav.canUndo()).toBe(true);

    // one undo restores the PRE-DRAG geometry — not an intermediate tick
    nav.undo();
    expect(engine.getLabel(c1)?.location).toEqual([1, 2, 3]);
    expect(nav.canUndo()).toBe(false);

    // redo reapplies the final geometry in one step
    nav.redo();
    expect(engine.getLabel(c1)?.location).toEqual([5, 2, 3]);
  });

  it("two gestures are two undo units", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const nav = createUndoNavigator(engine);

    dragGesture(engine, [[5, 2, 3]]);
    dragGesture(engine, [[9, 2, 3]]);

    nav.undo();
    expect(engine.getLabel(c1)?.location).toEqual([5, 2, 3]);
    nav.undo();
    expect(engine.getLabel(c1)?.location).toEqual([1, 2, 3]);
    expect(nav.canUndo()).toBe(false);
  });

  it("undo/redo re-publish nothing on the signal pipe", () => {
    const { engine } = makeEngine("sample-1", cuboidSample);
    const nav = createUndoNavigator(engine);

    dragGesture(engine, [[5, 2, 3]]);

    const observer = vi.fn();
    engine.subscribeSignal<GeometrySignal>(GEOMETRY_SIGNAL, c1Key, observer);

    nav.undo();
    nav.redo();

    expect(observer).not.toHaveBeenCalled();
  });
});
