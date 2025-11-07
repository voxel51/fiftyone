import React, { Fragment, useEffect, useState } from "react";
import { createUseEventHandler, useEventBus } from "./hooks";
import { EventHandler } from "./types";

export type DemoEventFamily = {
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

const useDemoEventHandler = createUseEventHandler<DemoEventFamily>();

const Source = () => {
  const [count, setCount] = useState(0);
  const eventBus = useEventBus<DemoEventFamily>({ channelId: "default" });

  // compile-time error; "foo" is not a key of DemoEventFamily
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
  const eventBus = useEventBus<DemoEventFamily>({ channelId: "default" });

  useEffect(() => {
    const eventAHandler: EventHandler<DemoEventFamily["demo:eventA"]> = (
      data
      // type-safe payload access
    ) => console.log(data.id, data.name);

    const eventBHandler: EventHandler<DemoEventFamily["demo:eventB"]> = (
      data
      // type-safe payload access
    ) => console.log(data.value);

    const eventDHandler: EventHandler = () =>
      console.log("Event D received (no payload)");

    eventBus.on("demo:eventA", eventAHandler);
    eventBus.on("demo:eventB", eventBHandler);
    eventBus.on("demo:eventD", eventDHandler);

    return () => {
      eventBus.off("demo:eventA", eventAHandler);
      eventBus.off("demo:eventB", eventBHandler);
      eventBus.off("demo:eventD", eventDHandler);
    };
  }, [eventBus]);

  // OR if you don't want to deal with on/off --
  useDemoEventHandler("demo:eventC", (data) => console.log(data.foo));

  // Optional payload handler
  useDemoEventHandler("demo:eventD", () => {
    console.log("Event D received (no payload)");
  });

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
