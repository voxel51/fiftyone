import { describe, expect, it, vi } from "vitest";

import {
  createUndoNavigator,
  makeDet,
  makeEngine,
  makeStore,
  ref,
} from "../testing/fixtures";
import { isWholeSampleReset } from "../store/types";
import type {
  PresenceEvent,
  PresenceListener,
  TemporalView,
} from "../temporal/types";

const makeFakeTemporal = () => {
  const listeners = new Set<PresenceListener>();
  const view: TemporalView = {
    isTemporal: true,
    getPresent: () => [],
    isPresent: () => true,
    subscribePresence: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dispose: () => listeners.clear(),
  };

  return {
    view,
    emit: (events: PresenceEvent[]) => listeners.forEach((l) => l(events)),
  };
};

describe("engine presence channel (stable across attachTemporal)", () => {
  it("forwards events from a view attached AFTER the subscription", () => {
    const { engine } = makeEngine();
    const received: PresenceEvent[][] = [];

    // subscribe BEFORE attaching the frame view — the sidebar's mount order
    engine.subscribePresence((events) => received.push([...events]));

    const fake = makeFakeTemporal();
    engine.attachTemporal(() => fake.view);

    const event: PresenceEvent = {
      ref: ref("frames.detections", "A", "s1"),
      kind: "enter",
    };
    fake.emit([event]);

    expect(received).toEqual([[event]]);
  });

  it("stops forwarding once the view is detached", () => {
    const { engine } = makeEngine();
    const received: PresenceEvent[][] = [];
    engine.subscribePresence((events) => received.push([...events]));

    const fake = makeFakeTemporal();
    const detach = engine.attachTemporal(() => fake.view);
    detach();

    fake.emit([{ ref: ref("frames.detections", "A", "s1"), kind: "enter" }]);
    expect(received).toEqual([]);
  });
});

describe("engine routing", () => {
  it("routes reads and writes by ref.sample", () => {
    const { engine } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const second = makeStore("s2", {
      ground_truth: { detections: [makeDet("d1", "dog")] },
    });
    engine.registerStore(second.store);

    // same (path, instanceId) in two samples — full-tuple identity routes
    expect(engine.getLabel(ref("ground_truth", "d1", "s1"))?.label).toBe("cat");
    expect(engine.getLabel(ref("ground_truth", "d1", "s2"))?.label).toBe("dog");

    engine.updateLabel(ref("ground_truth", "d1", "s2"), { label: "bird" });
    expect(engine.getLabel(ref("ground_truth", "d1", "s1"))?.label).toBe("cat");
    expect(engine.getLabel(ref("ground_truth", "d1", "s2"))?.label).toBe(
      "bird"
    );
  });

  it("unregistering a store detaches it", () => {
    const { engine, unregister } = makeEngine("s1");
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    unregister();
    expect(engine.getLabel(ref("ground_truth", "d1", "s1"))).toBeUndefined();
    expect(() =>
      engine.updateLabel(ref("ground_truth", "d1", "s1"), { label: "x" })
    ).toThrow(/no store/);
  });

  it("enumerates labels across stores", () => {
    const { engine } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const second = makeStore("s2", {
      ground_truth: { detections: [makeDet("d9", "dog")] },
    });
    engine.registerStore(second.store);

    const refs = engine.enumerateLabels(["Detections" as never]);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.sample).sort()).toEqual(["s1", "s2"]);
  });
});

describe("engine transactions", () => {
  it("coalesces all mutations into one ordered change dispatch", () => {
    const { engine } = makeEngine();
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    engine.transaction(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });
      engine.updateLabel(ref("ground_truth", "d2"), { label: "dog" });
      engine.deleteLabel(ref("ground_truth", "d1"));
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const changes = listener.mock.calls[0][0];
    expect(changes.map((c: { kind: string }) => c.kind)).toEqual([
      "update",
      "update",
      "delete",
    ]);
  });

  it("rolls back on throw; subscribers never observe the abort", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    expect(() =>
      engine.transaction(() => {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
        engine.createLabel("ground_truth", { label: "bird" });
        throw new Error("boom");
      })
    ).toThrow("boom");

    expect(listener).not.toHaveBeenCalled();
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(
      engine.listLabels({ sample: "sample-1", path: "ground_truth" })
    ).toHaveLength(1);
    expect(engine.isDirty()).toBe(false);
    expect(nav.canUndo()).toBe(false);
  });

  it("nested transactions join the outermost", () => {
    const { engine } = makeEngine();
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    engine.transaction(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

      engine.transaction(() => {
        engine.updateLabel(ref("ground_truth", "d2"), { label: "dog" });
      });
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(2);
  });

  it("an inner throw unwinds the whole outermost transaction", () => {
    const { engine } = makeEngine();

    expect(() =>
      engine.transaction(() => {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

        engine.transaction(() => {
          throw new Error("inner");
        });
      })
    ).toThrow("inner");

    expect(engine.isDirty()).toBe(false);
  });

  it("bare mutators are implicit one-op transactions", () => {
    const { engine } = makeEngine();
    const nav = createUndoNavigator(engine);
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(nav.canUndo()).toBe(true);
  });

  it("throws on writes from within a change subscriber", () => {
    const { engine } = makeEngine();
    const errors: unknown[] = [];
    engine.subscribeChanges(() => {
      try {
        engine.updateLabel(ref("ground_truth", "d2"), { label: "echo" });
      } catch (error) {
        errors.push(error);
      }
    });

    engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/within a subscriber/);
  });
});

describe("engine undo (driven through the commit/drop emission contract)", () => {
  it("undoes and redoes a value edit exactly (replace, not merge)", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    engine.updateLabel(ref("ground_truth", "d1"), {
      label: "dog",
      confidence: 0.9,
    });

    nav.undo();
    // the added `confidence` field must not survive the undo
    expect(engine.getLabel(ref("ground_truth", "d1"))).toEqual(
      makeDet("d1", "cat")
    );

    nav.redo();
    expect(engine.getLabel(ref("ground_truth", "d1"))).toMatchObject({
      label: "dog",
      confidence: 0.9,
    });
  });

  it("undoes a create as a delete, and a delete as a restore", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    const created = engine.createLabel("ground_truth", {
      _cls: "Detection",
      label: "bird",
    });
    engine.deleteLabel(ref("ground_truth", "d1"));

    nav.undo(); // restore d1
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");

    nav.undo(); // delete the created label
    expect(engine.getLabel(created)).toBeUndefined();

    nav.redo();
    expect(engine.getLabel(created)?.label).toBe("bird");
  });

  it("one transaction = one undo unit, inverses applied in reverse order", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    engine.transaction(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });
      engine.createLabel("ground_truth", { label: "bird" });
    });

    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(
      engine.listLabels({ sample: "sample-1", path: "ground_truth" })
    ).toHaveLength(1);
  });

  it("coalesces consecutive units sharing an undoKey into one entry", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    for (const confidence of [0.1, 0.5, 0.9]) {
      engine.transaction(
        () => engine.updateLabel(ref("ground_truth", "d1"), { confidence }),
        { undoKey: "confidence-slider" }
      );
    }

    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1"))).toEqual(
      makeDet("d1", "cat")
    );
    expect(nav.canUndo()).toBe(false);
  });

  it("mintGestureId yields unique keys that coalesce a gesture's commits", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    const nav = createUndoNavigator(engine);

    const a = engine.mintGestureId();
    const b = engine.mintGestureId();
    expect(a).not.toBe(b);

    // two commits tagged with one gesture id are one undo unit
    engine.transaction(
      () => engine.updateLabel(ref("ground_truth", "d1"), { label: "lion" }),
      { undoKey: a }
    );
    engine.transaction(() => engine.deleteLabel(ref("ground_truth", "d2")), {
      undoKey: a,
    });

    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(engine.getLabel(ref("ground_truth", "d2"))).toEqual(
      makeDet("d2", "dog")
    );
    expect(nav.canUndo()).toBe(false);
  });

  it("does not record applied replays or no-op transactions", () => {
    const { engine } = makeEngine();
    const nav = createUndoNavigator(engine);

    engine.transaction(() => undefined);
    expect(nav.canUndo()).toBe(false);

    engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });
    nav.undo();
    expect(nav.canUndo()).toBe(false);
    expect(nav.canRedo()).toBe(true);
  });

  it("preserves undo history across a whole-sample reset", () => {
    // value-based undo survives persistence: an autosave echoes a whole-sample
    // reset (setData) on the same sample, and undoing the prior edit is just a
    // new transaction writing the before-value. Sample/dataset switches GC
    // history via store unregistration (dropSample), not the reset.
    const { engine, store } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    engine.updateLabel(ref("ground_truth", "d1", "s1"), { label: "dog" });
    expect(nav.canUndo()).toBe(true);

    store.setData({ ground_truth: { detections: [makeDet("d1", "dog")] } });
    expect(nav.canUndo()).toBe(true);

    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1", "s1"))?.label).toBe("cat");
  });

  it("rollbackEntry applies and drops a specific entry (pruning the navigator)", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    engine.deleteLabel(ref("ground_truth", "d1"));
    const entry = engine.lastUndoEntry();

    engine.rollbackEntry(entry!);

    expect(engine.getLabel(ref("ground_truth", "d1"))?.label).toBe("cat");
    expect(nav.canUndo()).toBe(false);
    expect(nav.canRedo()).toBe(false);
  });

  it("emits a coalesced flag and drop ids on the emission channels", () => {
    const { engine, unregister } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const commits: boolean[] = [];
    const drops: string[][] = [];
    engine.subscribeUndoableCommit((_entry, coalesced) =>
      commits.push(coalesced)
    );
    engine.subscribeUndoableDrop((ids) => drops.push(ids));

    engine.transaction(
      () => engine.updateLabel(ref("ground_truth", "d1"), { confidence: 0.1 }),
      { undoKey: "g" }
    );
    engine.transaction(
      () => engine.updateLabel(ref("ground_truth", "d1"), { confidence: 0.9 }),
      { undoKey: "g" }
    );
    expect(commits).toEqual([false, true]);

    unregister();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toHaveLength(1);
  });
});

describe("engine scope", () => {
  it("binds the sample and filters the change stream", () => {
    const { engine } = makeEngine("s1");
    const second = makeStore("s2");
    engine.registerStore(second.store);

    const scoped = engine.scope("s2");
    const listener = vi.fn();
    scoped.subscribeChanges(listener);

    engine.updateLabel(ref("ground_truth", "d1", "s1"), { label: "cat" });
    expect(listener).not.toHaveBeenCalled();

    scoped.updateLabel(
      { path: "ground_truth", instanceId: "d2" },
      { label: "dog" }
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(engine.getLabel(ref("ground_truth", "d2", "s2"))?.label).toBe("dog");
  });

  it("createLabel requires scope when multiple stores are registered", () => {
    const { engine } = makeEngine("s1");
    engine.registerStore(makeStore("s2").store);

    expect(() => engine.createLabel("ground_truth", { label: "x" })).toThrow(
      /scope/
    );

    const created = engine.scope("s2").createLabel("ground_truth", {
      label: "x",
    });
    expect(created.sample).toBe("s2");
  });
});

describe("engine persistence aggregation", () => {
  it("emits one patch entry per dirty sample", () => {
    const { engine } = makeEngine("s1");
    engine.registerStore(makeStore("s2").store);

    engine.updateLabel(ref("ground_truth", "d1", "s2"), { label: "dog" });

    const patches = engine.getJsonPatch();
    expect(patches).toHaveLength(1);
    expect(patches[0].sample).toBe("s2");
    expect(engine.isDirty()).toBe(true);
  });
});

describe("engine display channel", () => {
  it("notifies once per transaction with a single version bump", () => {
    const { engine } = makeEngine();
    const listener = vi.fn();
    engine.subscribe(listener);
    const before = engine.getVersion();

    engine.transaction(() => {
      engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });
      engine.updateLabel(ref("ground_truth", "d2"), { label: "dog" });
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(engine.getVersion()).toBe(before + 1);
  });
});

describe("whole-sample reset propagation", () => {
  it("relays the reset sentinel through the merged stream", () => {
    const { engine, store } = makeEngine();
    const listener = vi.fn();
    engine.subscribeChanges(listener);

    store.setData({ ground_truth: { detections: [makeDet("d1", "cat")] } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(isWholeSampleReset(listener.mock.calls[0][0][0])).toBe(true);
  });
});

describe("store unregistration sweep", () => {
  it("prunes the departed sample's interaction refs and undo history", () => {
    const { engine, unregister } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);

    engine.updateLabel(ref("ground_truth", "d1", "s1"), { label: "dog" });
    engine.interaction.setActive([ref("ground_truth", "d1", "s1")]);
    engine.interaction.setHovered(ref("ground_truth", "d1", "s1"), true);
    expect(nav.canUndo()).toBe(true);

    unregister();

    expect(engine.interaction.getActive()).toEqual([]);
    expect(engine.interaction.getAnchor()).toBeUndefined();
    expect(engine.interaction.getHovered()).toEqual([]);
    expect(nav.canUndo()).toBe(false);
  });

  it("sweeps only the departed sample — survivors keep selection and undo", () => {
    const { engine } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    const nav = createUndoNavigator(engine);
    const second = makeStore("s2", {
      ground_truth: { detections: [makeDet("d9", "dog")] },
    });
    const unregisterSecond = engine.registerStore(second.store);

    engine.updateLabel(ref("ground_truth", "d1", "s1"), { label: "lynx" });
    engine.updateLabel(ref("ground_truth", "d9", "s2"), { label: "wolf" });
    engine.interaction.setActive([
      ref("ground_truth", "d9", "s2"),
      ref("ground_truth", "d1", "s1"),
    ]);

    unregisterSecond();

    expect(engine.interaction.getActive()).toEqual([
      ref("ground_truth", "d1", "s1"),
    ]);
    expect(engine.interaction.getAnchor()).toEqual(
      ref("ground_truth", "d1", "s1")
    );
    expect(nav.canUndo()).toBe(true);
    nav.undo();
    expect(engine.getLabel(ref("ground_truth", "d1", "s1"))?.label).toBe("cat");
    expect(nav.canUndo()).toBe(false);
  });

  it("dispatches no label changes and notifies interaction once", () => {
    const { engine, unregister } = makeEngine("s1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1", "s1")]);

    const changes = vi.fn();
    const interaction = vi.fn();
    engine.subscribeChanges(changes);
    engine.interaction.subscribe(interaction);

    unregister();

    expect(changes).not.toHaveBeenCalled();
    expect(interaction).toHaveBeenCalledTimes(1);
  });
});
