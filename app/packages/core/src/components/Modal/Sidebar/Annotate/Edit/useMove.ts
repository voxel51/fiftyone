import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useEffect } from "react";

export default function useMove() {
  const { scene } = useLighter();

  useEffect(() => {
    const store = getDefaultStore();

    scene?.on(LIGHTER_EVENTS.OVERLAY_BOUNDS_CHANGED, (event) => {
      console.log(event.detail);
    });
  }, [scene]);
}
