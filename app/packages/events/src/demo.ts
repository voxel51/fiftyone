import { getEventBus } from "./dispatch";
import { EventHandler } from "./types";

export type DemoEventGroup = {
  "demo:eventA": {
    id: string;
    name: string;
  };
  "demo:eventB": {
    value: number;
  };
  "demo:eventC": {
    foo: string[];
  };
  // Event with no payload
  "demo:eventD": undefined;
};

/**
 * JavaScript-only demo of the event system.
 * Demonstrates both synchronous and asynchronous handlers.
 */
export async function runDemo() {
  const eventBus = getEventBus<DemoEventGroup>();

  // compile-time error; "foo" is not a key of DemoEventGroup
  // eventBus.dispatch("foo", {bar: "baz"});

  // compile-time error; event payload mismatch
  // eventBus.dispatch("demo:eventA", {foo: "bar"});

  // compile-time error; event payload must be undefined
  // eventBus.dispatch("demo:eventD", {foo: "bar"});

  const eventAHandler: EventHandler<DemoEventGroup["demo:eventA"]> = (
    data
    // type-safe payload access
  ) => {
    console.log("Event A received:", data.id, data.name);
  };

  const eventBHandler: EventHandler<DemoEventGroup["demo:eventB"]> = (data) => {
    console.log("Event B received:", data.value);
  };

  const eventCHandler: EventHandler<DemoEventGroup["demo:eventC"]> = (data) => {
    console.log("Event C received:", data.foo);
  };

  const eventDHandler: EventHandler<DemoEventGroup["demo:eventD"]> = () => {
    console.log("Event D received (no payload)");
  };

  const asyncEventAHandler: EventHandler<
    DemoEventGroup["demo:eventA"]
  > = async (data) => {
    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("Async Event A handler completed:", data.id, data.name);
  };

  // Another async handler for the same event - runs in parallel
  const asyncEventAHandler2: EventHandler<
    DemoEventGroup["demo:eventA"]
  > = async (data) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log("Async Event A handler 2 completed:", data.id);
  };

  eventBus.on("demo:eventA", eventAHandler);
  eventBus.on("demo:eventA", asyncEventAHandler);
  eventBus.on("demo:eventA", asyncEventAHandler2);
  eventBus.on("demo:eventB", eventBHandler);
  eventBus.on("demo:eventC", eventCHandler);
  eventBus.on("demo:eventD", eventDHandler);

  console.log("--- Dispatching events ---");

  // type-safe event names and payloads
  eventBus.dispatch("demo:eventA", {
    id: "some-id",
    name: "some-name",
  });

  let count = 0;
  eventBus.dispatch("demo:eventB", { value: count });
  count++;
  eventBus.dispatch("demo:eventB", { value: count });

  eventBus.dispatch("demo:eventC", {
    foo: ["bar", "baz", "qux"],
  });

  // Optional payload - can dispatch without data
  eventBus.dispatch("demo:eventD");

  // Demonstrate async handlers - dispatch doesn't wait for async handlers to complete
  console.log("\n--- Dispatching event with async handlers ---");
  eventBus.dispatch("demo:eventA", {
    id: "async-demo",
    name: "async-name",
  });
  console.log(
    "Dispatch returned immediately (async handlers run in background)"
  );

  // Wait a bit to see async handlers complete
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Unregister handlers
  console.log("\n--- Unregistering handlers ---");
  eventBus.off("demo:eventA", eventAHandler);
  eventBus.off("demo:eventA", asyncEventAHandler);
  eventBus.off("demo:eventA", asyncEventAHandler2);
  eventBus.off("demo:eventB", eventBHandler);
  eventBus.off("demo:eventC", eventCHandler);
  eventBus.off("demo:eventD", eventDHandler);
}
