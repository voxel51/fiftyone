import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import type {
  Looker3dHandle,
  SurfaceController,
  Working3dLabel,
} from "../engine";

/**
 * The looker-3d {@link SurfaceController}, registered by the app layer's
 * annotation bridge (`useLooker3dAnnotationBridge`) so the 3D surface's own
 * gesture operations (`@fiftyone/looker-3d`'s `operations.ts`) commit through
 * the engine without reaching across into the modal wiring.
 *
 * Mirrors the {@link AnnotationContextManager} DI slot. The controller is bound
 * to the live bridge (scene sample id + working store), so it changes identity
 * when the bridge re-creates; the binding agent re-registers and consumers read
 * the latest off the atom.
 */
const registeredControllerAtom = atom<SurfaceController<Looker3dHandle> | null>(
  null
);

/**
 * Binding agent for the looker-3d surface controller. Mount once where the
 * bridge is created (the annotation root); resets on unmount. Pass `null` while
 * the bridge is inert (scene id not yet settled) so consumers degrade rather
 * than hit the not-ready controller's throwing methods.
 */
export const useRegisterLooker3dSurfaceController = (
  controller: SurfaceController<Looker3dHandle> | null
): void => {
  const setController = useSetAtom(registeredControllerAtom);

  useEffect(() => {
    setController(controller);

    return () => setController(null);
  }, [controller, setController]);
};

/**
 * The registered looker-3d surface controller, or `null` before the bridge has
 * mounted one.
 */
export const useRegisteredLooker3dSurfaceController =
  (): SurfaceController<Looker3dHandle> | null =>
    useAtomValue(registeredControllerAtom);

/**
 * Label-addressed write-half for the looker-3d surface, built over the
 * registered {@link SurfaceController}. The 3D working store stays the
 * optimistic-render layer; these carry the same edit through to the engine (and
 * thus {@link Sample} + persistence), origin-suppressed so the read-half bridge
 * never echoes the surface's own write back onto its working entry.
 *
 * Create collapses into commit: a 3D draft is born with a durable ObjectId
 * (`objectId()` at draw time), so `commit` upserts — the first commit creates
 * (cf. the Lighter create-from-establish path).
 *
 * Both methods no-op until a controller is registered; in that window the
 * legacy `useSync3dSample` write-half still mirrors the working store onto
 * {@link Sample}, so edits are never dropped.
 */
export interface Looker3dSurfaceWrite {
  /** Whether a controller is registered (the engine surface is live). */
  readonly ready: boolean;
  /** Upsert a label into the engine (create or update). */
  commit(label: Working3dLabel): void;
  /** Delete a label from the engine. */
  remove(ref: { path: string; instanceId: string }): void;
}

export const useLooker3dSurfaceWrite = (): Looker3dSurfaceWrite => {
  const controller = useRegisteredLooker3dSurfaceController();

  return useMemo(
    () => ({
      ready: controller !== null,

      // a store-bound handle reading the explicitly-supplied label: the
      // controller's `toLabel` serializes it (build3dLabel strips the
      // working-only attrs) and commits in one origin-suppressed transaction
      commit: (label) =>
        controller?.commit({
          instanceId: label._id,
          path: label.path,
          read: () => label,
          apply: () => undefined,
        }),

      remove: (ref) => controller?.deleteLabel(ref),
    }),
    [controller]
  );
};
