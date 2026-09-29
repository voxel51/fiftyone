/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SamplePagePhase } from "@fiftyone/core";
import { useLocation } from "@fiftyone/location";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppRoute } from "../location/routes";
import { createSampleTransition } from "./transition";

const REVEAL_MS = 200;

const isSampleRoute = (route: AppRoute) =>
  route.kind === "sample" || route.kind === "group";

/**
 * The sample page, driven by the route. Opening runs in a strict order: the
 * tile lands on the page's media, the page fades in over the grid, and only
 * then does the grid unmount. A cold link starts on the page, with no grid.
 */
export default function useSamplePage() {
  const { route } = useLocation<AppRoute>();
  const onSample = isSampleRoute(route);
  const transition = useMemo(createSampleTransition, []);
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<SamplePagePhase>(
    onSample ? "open" : "grid",
  );

  useEffect(() => {
    if (!onSample) {
      transition.settle();
      setPhase("grid");
      return;
    }
    setPhase((current) => (current === "grid" ? "opening" : current));
  }, [onSample, transition]);

  useEffect(() => {
    const page = ref.current;
    if (phase !== "opening" || !page) return undefined;

    let cancelled = false;
    (async () => {
      await transition.land(page);
      if (cancelled) return;
      if (typeof page.animate === "function") {
        await page
          .animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: REVEAL_MS,
            fill: "forwards",
          })
          .finished.catch(() => undefined);
      }
      if (cancelled) return;
      transition.settle(page);
      setPhase("open");
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, transition]);

  return { phase, ref, transition };
}
