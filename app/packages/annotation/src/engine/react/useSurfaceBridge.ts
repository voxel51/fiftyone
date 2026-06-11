/**
 * The retained-mode integration entry point (spec §6): registers the bridge
 * on mount (driving the engine-derived read-half, §6.1) and returns a stable
 * {@link SurfaceController} so surface code carries only gesture vocabulary.
 * Dependencies are injected (§11) — the binding-agent hook supplies the
 * engine.
 */

import { useEffect, useMemo } from "react";

import { createSurfaceController } from "../bridge/surfaceController";
import type { SurfaceController } from "../bridge/surfaceController";
import type { AdapterMap, SurfaceBridge } from "../bridge/types";
import type { AnnotationEngine } from "../core/engine";

export const useSurfaceBridge = <Handle, Descriptor>({
  engine,
  bridge,
  adapters,
}: {
  engine: AnnotationEngine;
  bridge: SurfaceBridge<Handle, Descriptor>;
  adapters: AdapterMap<Handle, Descriptor>;
}): SurfaceController<Handle> => {
  useEffect(
    () => engine.registerBridge(bridge, adapters),
    [engine, bridge, adapters]
  );

  return useMemo(
    () => createSurfaceController({ engine, bridge, adapters }),
    [engine, bridge, adapters]
  );
};
