import { describe, expect, it, vi } from "vitest";

import { encodeEntityId } from "../identity/entityId";
import { makeDet, makeEngine, ref } from "../testing/fixtures";

const key = (instanceId: string) =>
  encodeEntityId("dataset", ref("ground_truth", instanceId));

describe("signal pipe", () => {
  it("routes by topic and entity key", () => {
    const { engine } = makeEngine();
    const onGeometry = vi.fn();
    const onOther = vi.fn();

    engine.subscribeSignal("geometry", key("d1"), onGeometry);
    engine.subscribeSignal("geometry", key("d2"), onOther);
    engine.subscribeSignal("cursor", key("d1"), onOther);

    engine.publishSignal("geometry", key("d1"), { w: 10 });

    expect(onGeometry).toHaveBeenCalledWith({ w: 10 }, key("d1"));
    expect(onOther).not.toHaveBeenCalled();
  });

  it("wildcard subscribers observe every key on the topic", () => {
    const { engine } = makeEngine();
    const handler = vi.fn();
    engine.subscribeSignal("geometry", "*", handler);

    engine.publishSignal("geometry", key("d1"), 1);
    engine.publishSignal("geometry", key("d2"), 2);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(2, key("d2"));
  });

  it("is a pure firehose: no replay-on-subscribe", () => {
    const { engine } = makeEngine();

    engine.publishSignal("geometry", key("d1"), { w: 10 });

    const late = vi.fn();
    engine.subscribeSignal("geometry", key("d1"), late);
    expect(late).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const { engine } = makeEngine();
    const handler = vi.fn();
    const unsubscribe = engine.subscribeSignal("geometry", key("d1"), handler);

    unsubscribe();
    engine.publishSignal("geometry", key("d1"), 1);

    expect(handler).not.toHaveBeenCalled();
  });

  it("signal observers may not write back (render only)", () => {
    const { engine } = makeEngine();
    const errors: unknown[] = [];

    engine.subscribeSignal("geometry", key("d1"), () => {
      try {
        engine.updateLabel(ref("ground_truth", "d1"), { label: "x" });
      } catch (error) {
        errors.push(error);
      }
    });

    engine.publishSignal("geometry", key("d1"), 1);

    expect(errors).toHaveLength(1);
  });
});

describe("pool temporal view (non-temporal)", () => {
  it("presence equals the pool", () => {
    const { engine } = makeEngine("sample-1", {
      ground_truth: { detections: [makeDet("d1", "cat")] },
      classification: { _id: "c1", _cls: "Classification", label: "sunny" },
    });

    const present = engine.temporal.getPresent();
    expect(present).toHaveLength(2);
    expect(engine.temporal.isPresent(ref("ground_truth", "d1"))).toBe(true);
    expect(engine.temporal.isPresent(ref("ground_truth", "nope"))).toBe(false);
  });

  it("the presence stream is inert by absence", () => {
    const { engine } = makeEngine();
    const listener = vi.fn();
    const unsubscribe = engine.temporal.subscribePresence(listener);

    engine.updateLabel(ref("ground_truth", "d1"), { label: "cat" });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
