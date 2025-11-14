import { beforeEach, describe, expect, test, vi } from "vitest";
import { __test__, getEventBus } from "./registry";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
};

describe("getEventBus", () => {
  beforeEach(() => {
    __test__.registry.clear();
  });

  test("should return the same instance", () => {
    const bus1 = getEventBus<TestEventGroup>();
    const bus2 = getEventBus<TestEventGroup>();

    expect(bus1).toBe(bus2);
  });

  test("should share handlers across all instances", () => {
    const handler = vi.fn();

    const bus1 = getEventBus<TestEventGroup>();
    const bus2 = getEventBus<TestEventGroup>();

    bus1.on("test:eventA", handler);
    bus2.dispatch("test:eventA", { id: "1", name: "test" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: "1", name: "test" });
  });

  test("should work with different event group types", () => {
    type Group1 = {
      "group1:event": { value: string };
    };
    type Group2 = {
      "group2:event": { value: number };
    };

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const bus1 = getEventBus<Group1>();
    const bus2 = getEventBus<Group2>();

    // Both should work independently
    // (TypeScript will enforce type safety, but runtime they share the dispatcher)
    bus1.on("group1:event", handler1);
    bus2.on("group2:event", handler2);

    bus1.dispatch("group1:event", { value: "test" });
    bus2.dispatch("group2:event", { value: 42 });

    expect(handler1).toHaveBeenCalledWith({ value: "test" });
    expect(handler2).toHaveBeenCalledWith({ value: 42 });
  });

  test("should create dispatcher instance", () => {
    const bus1 = getEventBus<TestEventGroup>();
    expect(bus1).toBeDefined();
    expect(__test__.registry.has("default")).toBe(true);
  });

  test("should reuse existing dispatcher instance", () => {
    const bus1 = getEventBus<TestEventGroup>();
    const bus2 = getEventBus<TestEventGroup>();

    expect(bus1).toBe(bus2);
    expect(__test__.registry.size).toBe(1);
  });

  test("should create new dispatcher instance after registry clear", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const bus1 = getEventBus<TestEventGroup>();
    bus1.on("test:eventA", handler1);

    // Clear registry - this removes the channel from registry but bus1 still exists
    __test__.registry.clear();

    // Create new bus - should be a new instance
    const bus2 = getEventBus<TestEventGroup>();
    bus2.on("test:eventA", handler2);

    // bus1 and bus2 are different instances
    expect(bus1).not.toBe(bus2);

    // bus1's handler should still work (it's a separate instance)
    bus1.dispatch("test:eventA", { id: "1", name: "test1" });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ id: "1", name: "test1" });

    // bus2's handler should work independently
    bus2.dispatch("test:eventA", { id: "2", name: "test2" });
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith({ id: "2", name: "test2" });

    // Handlers are isolated - handler1 should still only be called once
    expect(handler1).toHaveBeenCalledTimes(1);
  });

  test("should maintain registry size correctly", () => {
    expect(__test__.registry.size).toBe(0);

    getEventBus<TestEventGroup>();
    expect(__test__.registry.size).toBe(1);

    // Reusing shouldn't increase size
    getEventBus<TestEventGroup>();
    expect(__test__.registry.size).toBe(1);
  });

  test("should allow checking if default channel exists in registry", () => {
    expect(__test__.registry.has("default")).toBe(false);

    getEventBus<TestEventGroup>();
    expect(__test__.registry.has("default")).toBe(true);
  });
});
