/**
 * The retained-mode integration entry point: registers the bridge
 * on mount (driving the engine-derived read-half) and returns a stable
 * {@link SurfaceController} so surface code carries only gesture vocabulary.
 * Dependencies are injected — the binding-agent hook supplies the
 * engine.
 *
 * `bridge` may be undefined while the surface boots (a Lighter scene mounts
 * asynchronously); registration waits and the controller throws if a gesture
 * somehow fires before the surface exists.
 */

import { useEffect, useMemo } from "react";

import { useAnnotationEventBus } from "../../hooks";
import { createSurfaceController } from "../bridge/surfaceController";
import type { SurfaceController } from "../bridge/surfaceController";
import type { AdapterMap, SurfaceBridge } from "../bridge/types";
import type { AnnotationEngine } from "../core/engine";

const notReady = (): never => {
  throw new Error("surface gesture before its bridge was registered");
};

const NOT_READY_CONTROLLER: SurfaceController<never> = {
  surface: "detached",
  transaction: notReady,
  updateLabel: notReady,
  createLabel: notReady,
  deleteLabel: notReady,
  setActive: notReady,
  toggleActive: notReady,
  setHovered: notReady,
  commit: notReady,
  create: notReady,
  selectHandle: notReady,
  hoverHandle: notReady,
};

export const useSurfaceBridge = <Handle, Descriptor>({
  engine,
  bridge,
  adapters,
}: {
  engine: AnnotationEngine;
  bridge: SurfaceBridge<Handle, Descriptor> | undefined;
  adapters: AdapterMap<Handle, Descriptor>;
}): SurfaceController<Handle> => {
  const eventBus = useAnnotationEventBus();

  useEffect(
    () => (bridge ? engine.registerBridge(bridge, adapters) : undefined),
    [engine, bridge, adapters],
  );

  return useMemo(
    () =>
      bridge
        ? createSurfaceController({
            engine,
            bridge,
            adapters,
            // wakes `useAutoInterpolate`: a frame-level geometry edit
            // auto-promoted to a keyframe must re-run linear interp on
            // the bracketing tween segments. `trackId` is empty for now —
            // the only listener (`useAutoInterpolate`) reads instanceId/
            // frame/kind; downstream `trackId` consumers will be audited
            // separately.
            onAutoKeyframe: (_ref, frame, instanceId) => {
              eventBus.dispatch("annotation:keyframeChanged", {
                trackId: "",
                instanceId,
                frame,
                kind: "set",
              });
            },
          })
        : (NOT_READY_CONTROLLER as SurfaceController<Handle>),
    [engine, bridge, adapters, eventBus],
  );
};
