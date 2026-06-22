/**
 * The Lighter surface bridge: kind-agnostic plumbing between the
 * engine's read-half loop and a `Scene2D`. Methods close over the scene; the
 * engine never holds a scene reference.
 *
 * Async-sourced mounts are gated: a descriptor
 * carrying `pendingMaskPath` defers its insert until the mask decodes — no
 * maskless intermediate overlay ever mounts. In-flight gates dedupe (a
 * re-fired reconcile refreshes the descriptor, never starts a second decode),
 * and a resolve whose ref no longer reads back from the engine is discarded.
 */

import type { BaseOverlay, OverlayFactory, Scene2D } from "@fiftyone/lighter";
import { decodeMaskPath } from "@fiftyone/lighter";
import type { LabelData } from "@fiftyone/utilities";
import { DETECTION } from "@fiftyone/utilities";

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
  /**
   * Map a raw media sub-field value (e.g. `mask_path`) to a fetchable URL.
   * Owned by the modal wiring (the sample's `sources` map + media-URL
   * rewrite); when absent or unresolvable the overlay mounts without its
   * mask, with a warning — the legacy terminal fallback.
   */
  resolveMediaUrl?: (args: {
    path: string;
    instanceId: string;
    subField: string;
    raw: string;
  }) => string | undefined;
  /**
   * Stamp the occurrence coordinate onto `refOf` for a frame-locked surface:
   * the scene holds one overlay per track (keyed by `instanceId`, frame-
   * agnostic), but engine writes/selection address `(instanceId, frame)`. The
   * video canvas supplies the playhead's current frame; image/3D omit it (a
   * frame-less ref). Read live so a gesture stamps the frame it lands on.
   *
   * Receives the overlay's PATH so the surface can decide per-overlay: a video
   * canvas frame-stamps its per-frame detections but NOT a sample-level overlay
   * sharing the scene (a temporal detection), which must stay frame-less or its
   * ref won't match the sidebar / timeline. Returns `undefined` to omit.
   */
  frameOf?: (path: string) => number | undefined;
}

export const createLighterBridge = ({
  scene,
  overlayFactory,
  sample,
  paths,
  readLabel,
  resolveMediaUrl,
  frameOf,
}: LighterBridgeDeps): SurfaceBridge<BaseOverlay, LighterDescriptor> => {
  /** Gated mounts in flight, by overlay id — the latest descriptor wins. */
  const pending = new Map<string, LighterDescriptor>();

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
    mask: Awaited<ReturnType<typeof decodeMaskPath>>
  ): BaseOverlay => {
    const overlay = overlayFactory.create<
      LighterDescriptor["options"],
      BaseOverlay
    >(descriptor.factoryKey, {
      ...descriptor.options,
      label,
      ...(mask ? { preDecodedMask: mask } : {}),
    });
    scene.addOverlay(overlay);
    managed.add(overlay.id);

    // silent re-apply absorbs anything committed while the decode was in
    // flight (descriptor geometry was built from the request-time label)
    overlay.applyLabel(label as Parameters<BaseOverlay["applyLabel"]>[0]);

    return overlay;
  };

  const mountWhenDecoded = async (id: string): Promise<void> => {
    for (;;) {
      const attempt = pending.get(id);

      if (!attempt) {
        return; // cancelled (lifecycle clear / superseded by a sync mount)
      }

      const path = attempt.options.field;
      const raw = attempt.pendingMaskPath as string;
      const url = resolveMediaUrl?.({
        path,
        instanceId: id,
        subField: "mask_path",
        raw,
      });

      if (!url) {
        console.warn(
          `[mask-path] detection ${id} in field "${path}" has mask_path ` +
            "but no resolvable URL; mounting without its mask"
        );
      }

      const mask = url ? await decodeMaskPath(url, path, DETECTION) : undefined;
      const latest = pending.get(id);

      if (!latest) {
        return; // cancelled mid-flight
      }

      if (latest.pendingMaskPath !== attempt.pendingMaskPath) {
        continue; // the source changed mid-flight — decode the new value
      }

      pending.delete(id);
      const label = readLabel({ path: latest.options.field, instanceId: id });

      if (!label) {
        return; // ref deleted or reconciled away while gated — discard
      }

      if (url && !mask) {
        console.warn(
          `[mask-path] decode failed for detection ${id} in field ` +
            `"${path}" (url=${url}); mounting without its mask`
        );
      }

      const overlay = insert(latest, label, mask);
      bridge.onDeferredMount?.(overlay);

      return;
    }
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

    refOf: (overlay) => {
      // frame-locked surfaces stamp the playhead's frame; image/3D and
      // sample-level overlays (frameOf returns undefined for their path) stay
      // frame-agnostic
      const frame = frameOf?.(overlay.field);

      return {
        path: overlay.field,
        instanceId: overlay.id,
        ...(frame != null ? { frame } : {}),
      };
    },

    mount: (descriptor) => {
      const { id } = descriptor.options;

      if (descriptor.pendingMaskPath === undefined) {
        // a sync mount supersedes any in-flight gate for the same id (the
        // label gained an inline mask, so there is nothing left to decode)
        pending.delete(id);

        const overlay = overlayFactory.create<
          LighterDescriptor["options"],
          BaseOverlay
        >(descriptor.factoryKey, descriptor.options);
        scene.addOverlay(overlay);
        managed.add(overlay.id);

        return overlay;
      }

      // the gate: defer until decoded — never a maskless intermediate
      const inFlight = pending.has(id);
      pending.set(id, descriptor);

      if (!inFlight) {
        void mountWhenDecoded(id);
      }

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
      // cancel gated mounts (lifecycle teardown)
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
