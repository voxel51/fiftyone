import { describe, expect, it, vi } from "vitest";

import { InteractionState } from "./interactionState";
import { makeDet, makeEngine, ref } from "../testing/fixtures";

describe("InteractionState active/anchor", () => {
  it("setActive replaces the set and anchors the last ref", () => {
    const state = new InteractionState();

    state.setActive([ref("ground_truth", "d1"), ref("ground_truth", "d2")]);

    expect(state.getActive()).toHaveLength(2);
    expect(state.isActive(ref("ground_truth", "d1"))).toBe(true);
    expect(state.getAnchor()).toEqual(ref("ground_truth", "d2"));

    state.setActive([]);
    expect(state.getActive()).toEqual([]);
    expect(state.getAnchor()).toBeUndefined();
  });

  it("toggleActive adds with anchor, removes with promotion", () => {
    const state = new InteractionState();

    state.toggleActive(ref("ground_truth", "d1"));
    state.toggleActive(ref("ground_truth", "d2"));
    expect(state.getAnchor()).toEqual(ref("ground_truth", "d2"));

    state.toggleActive(ref("ground_truth", "d2"));
    expect(state.isActive(ref("ground_truth", "d2"))).toBe(false);
    // the anchor promoted to a remaining member rather than clearing
    expect(state.getAnchor()).toEqual(ref("ground_truth", "d1"));
  });

  it("setAnchor moves the lead within the set and rejects non-members", () => {
    const state = new InteractionState();
    state.setActive([ref("ground_truth", "d1"), ref("ground_truth", "d2")]);

    state.setAnchor(ref("ground_truth", "d1"));
    expect(state.getAnchor()).toEqual(ref("ground_truth", "d1"));

    expect(() => state.setAnchor(ref("ground_truth", "d9"))).toThrow(
      /member of the active set/
    );
  });

  it("treats the same instanceId in different samples as distinct", () => {
    const state = new InteractionState();

    state.setActive([ref("ground_truth", "d1", "slice-a")]);

    expect(state.isActive(ref("ground_truth", "d1", "slice-b"))).toBe(false);
  });

  it("coalesces no-op writes (no version bump, no notify)", () => {
    const state = new InteractionState();
    const listener = vi.fn();
    state.subscribe(listener);

    state.setActive([ref("ground_truth", "d1")]);
    expect(listener).toHaveBeenCalledTimes(1);

    state.setActive([ref("ground_truth", "d1")]);
    state.toggleActive(ref("ground_truth", "d1"), true);
    state.setHovered(ref("ground_truth", "d2"), false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns referentially-stable projections between changes", () => {
    const state = new InteractionState();
    state.setActive([ref("ground_truth", "d1")]);

    expect(state.getActive()).toBe(state.getActive());
  });
});

describe("InteractionState hover", () => {
  it("aggregates hover as a set across surfaces", () => {
    const state = new InteractionState();

    state.setHovered(ref("ground_truth", "d1"), true);
    state.setHovered(ref("ground_truth", "d2"), true);
    expect(state.getHovered()).toHaveLength(2);

    state.setHovered(ref("ground_truth", "d1"), false);
    expect(state.isHovered(ref("ground_truth", "d1"))).toBe(false);
  });

  it("presence exit prunes hover only — never selection", () => {
    const state = new InteractionState();
    state.setActive([ref("ground_truth", "d1")]);
    state.setHovered(ref("ground_truth", "d1"), true);

    state.pruneHovered([ref("ground_truth", "d1")]);

    expect(state.isHovered(ref("ground_truth", "d1"))).toBe(false);
    expect(state.isActive(ref("ground_truth", "d1"))).toBe(true);
    expect(state.getAnchor()).toEqual(ref("ground_truth", "d1"));
  });
});

describe("InteractionState GC (engine-wired)", () => {
  it("a delete prunes active/hover and promotes the anchor, in one notify", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: {
        detections: [makeDet("d1", "cat"), makeDet("d2", "dog")],
      },
    });
    engine.interaction.setActive([
      ref("ground_truth", "d1"),
      ref("ground_truth", "d2"),
    ]);
    engine.interaction.setHovered(ref("ground_truth", "d2"), true);

    const listener = vi.fn();
    engine.interaction.subscribe(listener);

    engine.deleteLabel(ref("ground_truth", "d2"));

    expect(engine.interaction.isActive(ref("ground_truth", "d2"))).toBe(false);
    expect(engine.interaction.isHovered(ref("ground_truth", "d2"))).toBe(false);
    expect(engine.interaction.getAnchor()).toEqual(ref("ground_truth", "d1"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("updates never prune", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    engine.updateLabel(ref("ground_truth", "d1"), { label: "dog" });

    expect(engine.interaction.isActive(ref("ground_truth", "d1"))).toBe(true);
  });

  it("a whole-sample reset prunes that sample's refs", () => {
    const { engine, store } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1")]);
    engine.interaction.setHovered(ref("ground_truth", "d1"), true);

    store.setData({});

    expect(engine.interaction.getActive()).toEqual([]);
    expect(engine.interaction.getHovered()).toEqual([]);
    expect(engine.interaction.getAnchor()).toBeUndefined();
  });

  it("an aborted transaction leaves interaction state untouched", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
    });
    engine.interaction.setActive([ref("ground_truth", "d1")]);

    expect(() =>
      engine.transaction(() => {
        engine.deleteLabel(ref("ground_truth", "d1"));
        throw new Error("abort");
      })
    ).toThrow("abort");

    expect(engine.interaction.isActive(ref("ground_truth", "d1"))).toBe(true);
  });
});

describe("InteractionState reentrancy", () => {
  it("rejects label writes from an interaction listener", () => {
    const { engine } = makeEngine();
    const errors: unknown[] = [];

    engine.interaction.subscribe(() => {
      try {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "x" });
      } catch (error) {
        errors.push(error);
      }
    });

    engine.interaction.setActive([ref("ground_truth", "d1")]);

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/sinks/);
  });

  it("rejects interaction writes from a change listener", () => {
    const { engine } = makeEngine();
    const errors: unknown[] = [];

    engine.subscribeChanges(() => {
      try {
        engine.interaction.setActive([ref("ground_truth", "d1")]);
      } catch (error) {
        errors.push(error);
      }
    });

    engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(errors).toHaveLength(1);
  });
});
