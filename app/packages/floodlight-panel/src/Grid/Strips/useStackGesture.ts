/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type RefObject, useEffect, useRef } from "react";
import { createWheelSteps } from "./stackWheel";

// Safari reports pinch as gesture events, as a scale rather than a delta.
const SCALE_TO_DELTA = 100;

type GestureEvent = Event & { scale: number };

/**
 * Steps the stack under the pointer on Option/Alt + wheel or pinch. Only
 * those gestures are claimed (and the page zoom prevented), so a plain
 * wheel still scrolls the matrix.
 */
export default function useStackGesture(
  ref: RefObject<HTMLElement>,
  step: (delta: number) => void,
) {
  const latest = useRef(step);
  latest.current = step;

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const steps = createWheelSteps();

    const onWheel = (event: WheelEvent) => {
      const delta = steps.push(event, event.timeStamp);
      if (delta === null) return;
      event.preventDefault();
      event.stopPropagation();
      delta && latest.current(delta);
    };

    let scale = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      scale = (event as GestureEvent).scale;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const next = (event as GestureEvent).scale;
      const delta = steps.push(
        {
          altKey: false,
          ctrlKey: true,
          deltaMode: 0,
          deltaX: 0,
          deltaY: (scale - next) * SCALE_TO_DELTA,
        },
        event.timeStamp,
      );
      scale = next;
      delta && latest.current(delta);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("gesturestart", onGestureStart);
    element.addEventListener("gesturechange", onGestureChange);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
    };
  }, [ref]);
}
