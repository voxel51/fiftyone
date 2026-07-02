/**
 * The looker-3d retained-mode surface bridge. The 3D annotation WORKING STORE
 * is this surface's "scene" (cf. Scene2D for Lighter): the engine read-half
 * loop mounts/updates/unmounts working-store entries, and finalize gestures
 * commit them back through the SurfaceController.
 *
 * The store is injected ({@link WorkingStore3d}) so the bridge stays pure and
 * unit-testable; the React wiring hook supplies a Recoil-backed implementation.
 * `color` is a coloring-scheme view field the engine's Sample labels lack, so
 * the bridge stamps it at mount via the injected {@link Looker3dBridgeDeps.resolveColor}.
 *
 * No `applySelected`/`applyHovered`/`applyAnchor`: 3D selection and hover are
 * rendered declaratively from engine interaction state by the existing
 * `use3dInteractionAdapter` read-half, so the bridge mounts no per-handle
 * interaction visuals.
 */

import type { LabelData } from "@fiftyone/utilities";

import type { SurfaceBridge } from "../../bridge/types";
import type {
  Looker3dDescriptor,
  Looker3dHandle,
  Working3dLabel,
} from "./adapters";

/**
 * Imperative access to the 3D working store, scoped to the bridge's sample.
 * The Recoil-backed implementation lives in the wiring hook.
 */
export interface WorkingStore3d {
  /** Latest committed entry for `instanceId`, or undefined if absent. */
  get(instanceId: string): Working3dLabel | undefined;
  /** Insert/replace a full entry (rounds; clears any soft-delete). */
  add(label: Working3dLabel): void;
  /** Merge a partial onto an existing entry (rounds geometry), SILENT. */
  update(instanceId: string, partial: LabelData): void;
  /** Hard-remove an entry. */
  remove(instanceId: string): void;
}

export interface Looker3dBridgeDeps {
  sample: string;
  paths?: ReadonlySet<string>;
  store: WorkingStore3d;
  /** Coloring-scheme color for a label, stamped onto the entry at mount. */
  resolveColor?: (label: Working3dLabel) => string | undefined;
}

export const createLooker3dBridge = ({
  sample,
  paths,
  store,
  resolveColor,
}: Looker3dBridgeDeps): SurfaceBridge<Looker3dHandle, Looker3dDescriptor> => {
  // ids this bridge owns — mounted here or adopted via resolveHandle (an
  // un-migrated 3D create already present in the store). clear() removes
  // exactly these, never the whole store.
  const managed = new Set<string>();

  const handleFor = (instanceId: string, path: string): Looker3dHandle => ({
    instanceId,
    path,
    read: () => store.get(instanceId),
    apply: (label) => store.update(instanceId, label),
  });

  return {
    surface: "looker-3d",
    sample,
    paths,

    resolveHandle: (ref) => {
      const entry = store.get(ref.instanceId);
      if (!entry || entry.path !== ref.path) {
        return undefined;
      }

      managed.add(entry._id);
      return handleFor(entry._id, entry.path);
    },

    refOf: (handle) => ({ path: handle.path, instanceId: handle.instanceId }),

    mount: (descriptor) => {
      const color = resolveColor?.(descriptor.label) ?? descriptor.label.color;
      const entry = { ...descriptor.label, color } as Working3dLabel;

      store.add(entry);
      managed.add(entry._id);
      return handleFor(entry._id, entry.path);
    },

    unmount: (handle) => {
      store.remove(handle.instanceId);
      managed.delete(handle.instanceId);
    },

    clear: () => {
      for (const instanceId of managed) {
        store.remove(instanceId);
      }
      managed.clear();
    },
  };
};
