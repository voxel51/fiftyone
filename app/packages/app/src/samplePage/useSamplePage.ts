/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SamplePagePhase } from "@fiftyone/core";
import { useLocation } from "@fiftyone/location";
import { getSessionRef } from "@fiftyone/state";
import { useEffect, useRef, useState } from "react";
import type { AppRoute } from "../location/routes";
import { useAppSampleTransition } from "./context";

const REVEAL_MS = 200;

const isSampleRoute = (route: AppRoute) =>
  route.kind === "sample" || route.kind === "group";

const fadeTo = (page: HTMLElement, from: number, to: number) =>
  typeof page.animate === "function"
    ? page
        .animate([{ opacity: from }, { opacity: to }], {
          duration: REVEAL_MS,
          fill: "forwards",
        })
        .finished.then(() => undefined)
        .catch(() => undefined)
    : Promise.resolve();

/**
 * The sample page, driven by the route, in a strict order each way. Opening:
 * the tile lands on the page's media, the page fades in over the App, then
 * the App behind unmounts. Closing: the App remounts behind the page, the
 * media flies back to its tile as the page fades out, then the page unmounts
 * and the session resets. A cold link starts on the page, with no App behind.
 */
export default function useSamplePage() {
  const { route } = useLocation<AppRoute>();
  const onSample = isSampleRoute(route);
  const transition = useAppSampleTransition();
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<SamplePagePhase>(
    onSample ? "open" : "grid",
  );
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const endClose = useRef<() => void>();

  useEffect(() => {
    const current = phaseRef.current;
    if (onSample) {
      if (current === "grid" || current === "closing") setPhase("opening");
      return;
    }
    if (current === "open" || current === "opening") {
      // begun before the session follows the URL, so its reset waits
      endClose.current = transition.beginClose();
      setPhase("closing");
      return;
    }
    setPhase("grid");
  }, [onSample, transition]);

  useEffect(() => {
    const page = ref.current;
    if (phase !== "opening" || !page) return undefined;

    let cancelled = false;
    (async () => {
      await transition.land(page);
      if (cancelled) return;
      await fadeTo(page, 0, 1);
      if (cancelled) return;
      transition.settle(page);
      setPhase("open");
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, transition]);

  useEffect(() => {
    const page = ref.current;
    if (phase !== "closing" || !page) return undefined;

    let cancelled = false;
    const sampleId = getSessionRef().modalSelector?.id;
    (async () => {
      await transition.depart(page, sampleId, () => fadeTo(page, 1, 0));
      if (!cancelled) setPhase("grid");
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, transition]);

  // the page is gone, so the session may follow the URL
  useEffect(() => {
    if (phase !== "grid") return;
    endClose.current?.();
    endClose.current = undefined;
  }, [phase]);

  return { phase, ref };
}
