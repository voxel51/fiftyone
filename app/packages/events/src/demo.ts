import { getEventBus } from "./hooks";
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
 */
export function runDemo() {
  const eventBus = getEventBus<DemoEventGroup>();

  // compile-time error; "foo" is not a key of DemoEventGroup
  // eventBus.dispatch("foo", {bar: "baz"});

  // compile-time error; event payload mismatch
  // eventBus.dispatch("demo:eventA", {foo: "bar"});

  // compile-time error; event payload muse be undefined
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

  eventBus.on("demo:eventA", eventAHandler);
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

  // Unregister handlers
  console.log("\n--- Unregistering handlers ---");
  eventBus.off("demo:eventA", eventAHandler);
  eventBus.off("demo:eventB", eventBHandler);
  eventBus.off("demo:eventC", eventCHandler);
  eventBus.off("demo:eventD", eventDHandler);
}
