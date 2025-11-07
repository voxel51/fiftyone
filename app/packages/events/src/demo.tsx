import { useEventBus } from "./hooks";
import { Fragment, useEffect, useState } from "react";
import { EventHandler } from "./types";

export type DemoEventFamily = {
  "demo:eventA": {
    id: string;
    name: string;
  };
  "demo:eventB": {
    value: number;
  };
};

const Source = () => {
  const [count, setCount] = useState(0);
  const eventBus = useEventBus<DemoEventFamily>({ channelId: "default" });

  return (
    <>
      <button
        onClick={() => {
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
  const eventBus = useEventBus<DemoEventFamily>({ channelId: "default" });

  useEffect(() => {
    const eventAHandler: EventHandler<DemoEventFamily["demo:eventA"]> = (
      data
    ) => console.log(data.id, data.name);

    const eventBHandler: EventHandler<DemoEventFamily["demo:eventB"]> = (
      data
    ) => console.log(data.value);

    eventBus.on("demo:eventA", eventAHandler);
    eventBus.on("demo:eventB", eventBHandler);

    return () => {
      eventBus.off("demo:eventA", eventAHandler);
      eventBus.off("demo:eventB", eventBHandler);
    };
  }, [eventBus]);

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
