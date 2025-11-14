import { Fragment, useState } from "react";
import {
  createUseSynchronizedEventState,
  createUseEventHandler,
  useEventBus,
  useEventState,
} from "./hooks";

/**
 * Demo showing the difference between useEventHandler (side effects)
 * and useEventState (state derivation with tearing prevention).
 */

type CounterEventGroup = {
  "counter:updated": { count: number };
  "counter:reset": undefined;
};

const useCounterState = createUseSynchronizedEventState<CounterEventGroup>();
const useCounterHandler = createUseEventHandler<CounterEventGroup>();

/**
 * Component that dispatches counter events.
 */
const CounterSource = () => {
  const [count, setCount] = useState(0);
  const bus = useEventBus<CounterEventGroup>();

  return (
    <>
      <button
        onClick={() => {
          const newCount = count + 1;
          setCount(newCount);
          bus.dispatch("counter:updated", { count: newCount });
        }}
      >
        Increment and Dispatch
      </button>
      <button
        onClick={() => {
          setCount(0);
          bus.dispatch("counter:reset");
        }}
      >
        Reset
      </button>
    </>
  );
};

/**
 * Component using useEventState - reads state during render.
 * Multiple instances will always see the same value (no tearing).
 */
const CounterDisplay = ({ label }: { label: string }) => {
  // Read latest count from events - safe from tearing
  const latestEvent = useCounterState("counter:updated");
  const count = latestEvent?.count ?? 0;

  return (
    <div>
      {label}: {count}
    </div>
  );
};

/**
 * Component using useEventHandler - reacts with side effects.
 * This is for side effects, not for displaying state.
 */
const CounterLogger = () => {
  // Side effects - use createUseEventHandler
  useCounterHandler("counter:updated", (data) => {
    console.log("Counter updated to:", data.count);
  });

  useCounterHandler("counter:reset", () => {
    console.log("Counter reset");
  });

  return <Fragment />;
};

/**
 * Component using useEventState directly (without factory).
 */
const DirectCounterDisplay = () => {
  const count =
    useEventState<CounterEventGroup, "counter:updated">("counter:updated")
      ?.count ?? 0;

  return <div>Direct: {count}</div>;
};

export const StateDemo = () => {
  return (
    <>
      <CounterSource />
      <CounterDisplay label="Display 1" />
      <CounterDisplay label="Display 2" />
      <DirectCounterDisplay />
      <CounterLogger />
    </>
  );
};
