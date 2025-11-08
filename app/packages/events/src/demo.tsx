import { useEventBus, useEventHandler } from "./hooks";
import { Fragment, useEffect, useState } from "react";
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
};

const Source = () => {
  const [count, setCount] = useState(0);
  const eventBus = useEventBus<DemoEventGroup>({ channelId: "default" });

  // compile-time error; "foo" is not a key of DemoEventGroup
  // eventBus.dispatch("foo", {bar: "baz"});

  // compile-time error; event payload mismatch
  // eventBus.dispatch("demo:eventA", {foo: "bar"});

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
    </>
  );
};

const Sink = () => {
  const eventBus = useEventBus<DemoEventGroup>({ channelId: "default" });

  useEffect(() => {
    const eventAHandler: EventHandler<DemoEventGroup["demo:eventA"]> = (
      data
      // type-safe payload access
    ) => console.log(data.id, data.name);

    const eventBHandler: EventHandler<DemoEventGroup["demo:eventB"]> = (
      data
      // type-safe payload access
    ) => console.log(data.value);

    eventBus.on("demo:eventA", eventAHandler);
    eventBus.on("demo:eventB", eventBHandler);

    return () => {
      eventBus.off("demo:eventA", eventAHandler);
      eventBus.off("demo:eventB", eventBHandler);
    };
  }, [eventBus]);

  // OR if you don't want to deal with on/off --
  // annoying that you need to specify the event twice, but not terrible
  useEventHandler<DemoEventGroup, "demo:eventC">("demo:eventC", (data) =>
    // still type-safe payload access
    console.log(data.foo)
  );

  // could probably refactor the hook to create a closure around the first type,
  // but ugly syntax either way
  // useEventHandler<DemoEventGroup>()("demo:eventC", ...);

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
