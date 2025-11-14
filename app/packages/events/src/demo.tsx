import React, { Fragment, useCallback, useEffect, useState } from "react";
import { createUseEventHandler, useEventBus } from "./hooks";
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

const useDemoEventHandler = createUseEventHandler<DemoEventGroup>();

const Source = () => {
  const [count, setCount] = useState(0);
  const eventBus = useEventBus<DemoEventGroup>();

  // compile-time error; "foo" is not a key of DemoEventGroup
  // eventBus.dispatch("foo", {bar: "baz"});

  // compile-time error; event payload mismatch
  // eventBus.dispatch("demo:eventA", {foo: "bar"});

  // compile-time error; event payload muse be undefined
  // eventBus.dispatch("demo:eventD", {foo: "bar"});

  return (
    <>
      <button
        onClick={() => {
          // type-safe event names and payloads
          eventBus.dispatch("demo:eventA", {
            id: "some-id",
            name: "some-name",
          });
        }}
      >
        event A
      </button>

      <button
        onClick={() => {
          // type-safe event names and payloads
          eventBus.dispatch("demo:eventB", { value: count });
          setCount((prev) => prev + 1);
        }}
      >
        event B
      </button>

      <button
        onClick={() => {
          // Optional payload - can dispatch without data
          eventBus.dispatch("demo:eventD");
        }}
      >
        event D (no payload)
      </button>
    </>
  );
};

const Sink = () => {
  const eventBus = useEventBus<DemoEventGroup>();

  useEffect(() => {
    const eventAHandler: EventHandler<DemoEventGroup["demo:eventA"]> = (
      data
      // type-safe payload access
    ) => console.log(data.id, data.name);

    const asyncEventAHandler: EventHandler<
      DemoEventGroup["demo:eventA"]
    > = async (data) => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log("Async handler completed for:", data.id);
    };

    const eventBHandler: EventHandler<DemoEventGroup["demo:eventB"]> = (
      data
      // type-safe payload access
    ) => console.log(data.value);

    const eventDHandler: EventHandler = () =>
      console.log("Event D received (no payload)");

    eventBus.on("demo:eventA", eventAHandler);
    eventBus.on("demo:eventA", asyncEventAHandler);
    eventBus.on("demo:eventB", eventBHandler);
    eventBus.on("demo:eventD", eventDHandler);

    return () => {
      eventBus.off("demo:eventA", eventAHandler);
      eventBus.off("demo:eventA", asyncEventAHandler);
      eventBus.off("demo:eventB", eventBHandler);
      eventBus.off("demo:eventD", eventDHandler);
    };
  }, [eventBus]);

  // OR if you don't want to deal with on/off --
  // ⚠️ IMPORTANT: Always wrap handlers in useCallback to avoid unnecessary re-renders
  // Using useCallback directly as the second argument provides type inference
  useDemoEventHandler(
    "demo:eventC",
    useCallback((data) => {
      console.log(data.foo);
    }, [])
  );

  // Optional payload handler
  useDemoEventHandler(
    "demo:eventD",
    useCallback(() => {
      console.log("Event D received (no payload)");
    }, [])
  );

  // Async handler using the hook - handlers run in parallel
  useDemoEventHandler(
    "demo:eventA",
    useCallback(async (data) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      console.log("Hook async handler completed:", data.name);
    }, [])
  );

  return <Fragment />;
};

export const Demo = () => {
  return (
    <>
      <Source />
      <Sink />
    </>
  );
};
