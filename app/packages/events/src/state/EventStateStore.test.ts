import { beforeEach, describe, expect, test, vi } from "vitest";
import { getEventBus } from "../dispatch";
import { __test__, getEventStateStore } from "./EventStateStore";

type TestEventGroup = {
  "test:eventA": { id: string; name: string };
  "test:eventB": { value: number };
  "test:eventC": undefined;
};

describe("EventStateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __test__.registry.clear();
  });

  test("should create a subscription for an event", () => {
    const store = getEventStateStore<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");

    expect(subscription).toBeDefined();
    expect(typeof subscription.subscribe).toBe("function");
    expect(typeof subscription.getSnapshot).toBe("function");
    expect(typeof subscription.getSnapshotWithDefault).toBe("function");
  });

  test("should return undefined initially", () => {
    const store = getEventStateStore<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");

    expect(subscription.getSnapshot()).toBeUndefined();
  });

  test("should track latest event payload", () => {
    const store = getEventStateStore<TestEventGroup>();
    const bus = getEventBus<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");

    expect(subscription.getSnapshot()).toBeUndefined();

    // Subscribe to start tracking events
    const listener = vi.fn();
    subscription.subscribe(listener);

    bus.dispatch("test:eventA", { id: "1", name: "test" });
    expect(subscription.getSnapshot()).toEqual({ id: "1", name: "test" });

    bus.dispatch("test:eventA", { id: "2", name: "test2" });
    expect(subscription.getSnapshot()).toEqual({ id: "2", name: "test2" });
  });

  test("should notify subscribers when state changes", () => {
    const store = getEventStateStore<TestEventGroup>();
    const bus = getEventBus<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");

    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsubscribe1 = subscription.subscribe(listener1);
    const unsubscribe2 = subscription.subscribe(listener2);

    // Initial state
    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();

    // Dispatch event
    bus.dispatch("test:eventA", { id: "1", name: "test" });

    // Both listeners should be notified
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    // Dispatch another event
    bus.dispatch("test:eventA", { id: "2", name: "test2" });

    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(2);

    // Unsubscribe one listener
    unsubscribe1();

    // Dispatch another event
    bus.dispatch("test:eventA", { id: "3", name: "test3" });

    // Only listener2 should be notified
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(3);

    unsubscribe2();
  });

  test("should return memoized subscription for same event", () => {
    const store = getEventStateStore<TestEventGroup>();
    const subscription1 = store.createSubscription("test:eventA");
    const subscription2 = store.createSubscription("test:eventA");

    expect(subscription1).toBe(subscription2);
  });

  test("should handle different events independently", () => {
    const store = getEventStateStore<TestEventGroup>();
    const bus = getEventBus<TestEventGroup>();

    const subscriptionA = store.createSubscription("test:eventA");
    const subscriptionB = store.createSubscription("test:eventB");

    // Subscribe to start tracking events
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    subscriptionA.subscribe(listenerA);
    subscriptionB.subscribe(listenerB);

    bus.dispatch("test:eventA", { id: "1", name: "test" });
    bus.dispatch("test:eventB", { value: 42 });

    expect(subscriptionA.getSnapshot()).toEqual({ id: "1", name: "test" });
    expect(subscriptionB.getSnapshot()).toEqual({ value: 42 });
  });

  test("should return default value when provided", () => {
    const store = getEventStateStore<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");
    const defaultValue = { id: "default", name: "default" };

    expect(subscription.getSnapshotWithDefault(defaultValue)).toEqual(
      defaultValue
    );

    // Subscribe to start tracking events
    const listener = vi.fn();
    subscription.subscribe(listener);

    const bus = getEventBus<TestEventGroup>();
    bus.dispatch("test:eventA", { id: "1", name: "test" });

    expect(subscription.getSnapshotWithDefault(defaultValue)).toEqual({
      id: "1",
      name: "test",
    });
  });

  test("should cleanup all trackers", () => {
    const store = getEventStateStore<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");
    const listener = vi.fn();

    subscription.subscribe(listener);

    const bus = getEventBus<TestEventGroup>();
    bus.dispatch("test:eventA", { id: "1", name: "test" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(subscription.getSnapshot()).toEqual({ id: "1", name: "test" });

    store.cleanup();

    // After cleanup, trackers map is cleared, but existing subscription objects
    // still hold references to their trackers. The cleanup is mainly for testing
    // purposes. In practice, subscriptions are managed by React components.
    // The subscription still works because it has a reference to the tracker.
    // To fully test cleanup, we'd need to create a new subscription after cleanup.
    const newSubscription = store.createSubscription("test:eventA");
    expect(newSubscription.getSnapshot()).toBeUndefined();
  });

  test("should unsubscribe from event bus when no listeners remain", () => {
    const store = getEventStateStore<TestEventGroup>();
    const bus = getEventBus<TestEventGroup>();
    const subscription = store.createSubscription("test:eventA");

    const handler = vi.fn();
    bus.on("test:eventA", handler);

    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsubscribe1 = subscription.subscribe(listener1);
    const unsubscribe2 = subscription.subscribe(listener2);

    // Dispatch should trigger both listeners and the handler
    bus.dispatch("test:eventA", { id: "1", name: "test" });
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);

    // Unsubscribe both listeners
    unsubscribe1();
    unsubscribe2();

    // The store should have unsubscribed from the event bus
    // But the handler we registered directly should still work
    bus.dispatch("test:eventA", { id: "2", name: "test2" });
    expect(handler).toHaveBeenCalledTimes(2);
    // Listeners should not be called
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  test("should handle events with no payload", () => {
    const store = getEventStateStore<TestEventGroup>();
    const bus = getEventBus<TestEventGroup>();
    const subscription = store.createSubscription("test:eventC");

    expect(subscription.getSnapshot()).toBeUndefined();

    bus.dispatch("test:eventC");
    expect(subscription.getSnapshot()).toBeUndefined();
  });

  test("should return same store instance for same channel", () => {
    const store1 = getEventStateStore<TestEventGroup>();
    const store2 = getEventStateStore<TestEventGroup>();

    expect(store1).toBe(store2);
  });
});
