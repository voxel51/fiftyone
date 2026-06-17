/**
 * The looker-3d wiring hook: registers the bridge (the engine derives the
 * whole read-half — mount/update/unmount into the working store) and returns
 * the surface controller for the write-half (gesture finalize → commit, wired
 * by the caller's operations once the legacy ad-hoc path retires).
 *
 * The working store is INJECTED ({@link WorkingStore3d}) rather than pulled
 * from a scene context (cf. Lighter's `useLighter`): the modal wiring owns the
 * Recoil binding, keyed by the stable scene sample id. `store` and
 * `resolveColor` must be referentially stable — a new identity re-creates the
 * bridge (clear + rehydrate). An empty `sample` (scene id not yet settled)
 * yields an inert controller until it does.
 */

import { useEffect, useMemo } from "react";

import type { AnnotationEngine } from "../../core/engine";
import { useSurfaceBridge } from "../../react/useSurfaceBridge";
import type { Looker3dHandle } from "./adapters";
import { looker3dAdapters } from "./adapters";
import type { Looker3dBridgeDeps, WorkingStore3d } from "./looker3dBridge";
import { createLooker3dBridge } from "./looker3dBridge";
import type { SurfaceController } from "../../bridge/surfaceController";

export const useLooker3dEngineBridge = ({
  engine,
  sample,
  paths,
  store,
  resolveColor,
}: {
  engine: AnnotationEngine;
  sample: string;
  /** Active label paths — the bridge's partial-projection scope. A new set
   *  re-creates the bridge: the outgoing one clears, registration rehydrates. */
  paths?: ReadonlySet<string>;
  /** Recoil-backed working store, keyed by the scene sample id. */
  store: WorkingStore3d;
  /** Coloring-scheme color for a label, stamped onto the entry at mount. */
  resolveColor?: Looker3dBridgeDeps["resolveColor"];
}): SurfaceController<Looker3dHandle> => {
  const bridge = useMemo(
    () =>
      sample
        ? createLooker3dBridge({ sample, paths, store, resolveColor })
        : undefined,
    [sample, paths, store, resolveColor]
  );

  // a replaced bridge (scope/sample change) clears its entries on the way out;
  // the successor's registration mounts the new scope by reconcile
  useEffect(
    () => () => {
      bridge?.clear();
    },
    [bridge]
  );

  return useSurfaceBridge({ engine, bridge, adapters: looker3dAdapters });
};
