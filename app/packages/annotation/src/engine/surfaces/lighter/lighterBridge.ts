/**
 * The Lighter surface bridge: kind-agnostic plumbing between the
 * engine's read-half loop and a `Scene2D`. Methods close over the scene; the
 * engine never holds a scene reference.
 *
 * Async-sourced mounts are gated: a descriptor carrying `deferred` defers its
 * insert until the adapter's `resolve` completes — no partially-hydrated
 * intermediate overlay ever mounts. A newer mount for the same overlay aborts
 * the prior resolve (supersession), and a resolve whose ref no longer reads
 * back from the engine is discarded. The bridge is kind-agnostic: the adapter
 * owns the decode; the bridge only runs `resolve` and merges its result.
 */

import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
import type { LabelData } from "@fiftyone/utilities";

import type { SurfaceBridge } from "../../bridge/types";
import type { LighterDescriptor } from "./adapters";

export interface LighterBridgeDeps {
  scene: Scene2D;
  overlayFactory: OverlayFactory;
  /** The sample the scene renders; scopes the engine change stream. */
  sample: string;
  /** Active label paths; scopes the loop to the fields being annotated. */
  paths?: ReadonlySet<string>;
  /**
   * Read the current committed label — the gated-mount discard probe:
   * a decode that resolves after its ref was deleted or reconciled away must
   * not insert, and the freshest committed data wins over the request-time
   * descriptor.
   */
  readLabel: (ref: {
    path: string;
    instanceId: string;
  }) => LabelData | undefined;
}

export const createLighterBridge = ({
  scene,
  overlayFactory,
  sample,
  paths,
  readLabel,
}: LighterBridgeDeps): SurfaceBridge<BaseOverlay, LighterDescriptor> => {
  /**
   * Gated mounts in flight, by overlay id. Each carries an AbortController so a
   * newer mount (or `clear`) can supersede the in-flight resolve.
   */
  const pending = new Map<
    string,
    { descriptor: LighterDescriptor; controller: AbortController }
  >();

  /**
   * Overlay ids this bridge manages: mounted (sync or gated insert) or
   * adopted as handles via `resolveHandle`. `clear` removes exactly these —
   * surface-owned transients sharing the scene (the image plane, uncommitted
   * drafts, cursors) are not the bridge's to remove.
   */
  const managed = new Set<string>();

  const insert = (
    descriptor: LighterDescriptor,
    label: LabelData,
    extra: Record<string, unknown>
  ): BaseOverlay => {
    const overlay = overlayFactory.create<
      LighterDescriptor["options"],
      BaseOverlay
    >(descriptor.factoryKey, {
      ...descriptor.options,
      label,
      ...extra,
    });
    scene.addOverlay(overlay);
    managed.add(overlay.id);

    // silent re-apply absorbs anything committed while the resolve was in
    // flight (descriptor geometry was built from the request-time label)
    overlay.applyLabel(label as Parameters<BaseOverlay["applyLabel"]>[0]);

    return overlay;
  };

  const resolveAndInsert = async (
    id: string,
    descriptor: LighterDescriptor,
    signal: AbortSignal
  ): Promise<void> => {
    const extra = await descriptor.deferred?.(signal);

    // Superseded while resolving — a newer mount (or `clear`) aborted this gate
    // and/or replaced the pending entry. Drop the stale result.
    if (signal.aborted || pending.get(id)?.controller.signal !== signal) {
      return;
    }
    pending.delete(id);

    // Discard if the ref was deleted / reconciled away while gated.
    const label = readLabel({ path: descriptor.options.field, instanceId: id });
    if (!label) {
      return;
    }

    const overlay = insert(descriptor, label, extra ?? {});
    bridge.onDeferredMount?.(overlay);
  };

  const bridge: SurfaceBridge<BaseOverlay, LighterDescriptor> = {
    surface: "lighter",
    sample,
    paths,

    resolveHandle: (ref) => {
      const overlay = scene.getOverlay(ref.instanceId);

      if (!overlay || overlay.field !== ref.path) {
        return undefined;
      }

      // the loop adopts pre-existing scene overlays as handles (e.g. a
      // committed draft) — once resolved, the overlay is bridge-managed
      managed.add(overlay.id);
      return overlay;
    },

    refOf: (overlay) => ({ path: overlay.field, instanceId: overlay.id }),

    mount: (descriptor) => {
      const { id } = descriptor.options;

      // A fresh mount supersedes any in-flight gate for this overlay: abort the
      // prior resolve so its late result is discarded (and its fetch can stop).
      pending.get(id)?.controller.abort();
      pending.delete(id);

      if (!descriptor.deferred) {
        const overlay = overlayFactory.create<
          LighterDescriptor["options"],
          BaseOverlay
        >(descriptor.factoryKey, descriptor.options);
        scene.addOverlay(overlay);
        managed.add(overlay.id);

        return overlay;
      }

      // the gate: defer until `resolve` completes — never an intermediate
      const controller = new AbortController();
      pending.set(id, { descriptor, controller });
      void resolveAndInsert(id, descriptor, controller.signal);

      return undefined;
    },

    unmount: (overlay) => {
      // unmount is a SILENT apply, and it often runs inside the engine's
      // dispatch window (delete → loop). Removing a selected overlay makes
      // the scene's selection teardown emit an unflagged overlay-deselect —
      // handlers would write interaction state back mid-dispatch. Deselect
      // first, flagged, so handlers no-op and the teardown finds nothing
      // selected.
      scene.deselectOverlay(overlay.id, { ignoreSideEffects: true });
      scene.removeOverlay(overlay.id);
      managed.delete(overlay.id);
    },

    clear: () => {
      // cancel gated mounts (lifecycle teardown): abort in-flight resolves so
      // their late results are discarded.
      for (const { controller } of pending.values()) {
        controller.abort();
      }
      pending.clear();

      // exactly the overlays this bridge manages — surface-owned transients
      // sharing the scene (the image plane, uncommitted drafts, cursors) are
      // not the bridge's to remove. Deselect first, flagged, for the same
      // reason as unmount — and so engine selection survives a bridge swap
      // for the successor to reapply.
      for (const id of managed) {
        scene.deselectOverlay(id, { ignoreSideEffects: true });
        scene.removeOverlay(id);
      }

      managed.clear();
    },

    // silent interaction application: engine InteractionState is the
    // cross-surface truth; the scene's SelectionManager is render state.
    // Route through the scene (flagged — handlers must not re-enter the
    // engine) so the full selection affordance (drag/resize handles)
    // activates, not just the overlay's selected flag.
    applySelected: (overlay, selected) => {
      if (selected) {
        scene.selectOverlay(overlay.id, { ignoreSideEffects: true });
        return;
      }

      scene.deselectOverlay(overlay.id, { ignoreSideEffects: true });
    },

    applyHovered: (overlay, hovered) => {
      if (hovered) {
        overlay.forceHoverEnter();
        return;
      }

      overlay.forceHoverLeave();
    },
  };

  return bridge;
};
