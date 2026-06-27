/**
 * The shared write-half: ref-addressed `SurfaceActions` used
 * directly by declarative surfaces, and the bridge `SurfaceController` that
 * extends it with handle-bound conveniences (`commit`/`create`/`selectHandle`/
 * `hoverHandle`). Label mutations are transactional; interaction writes are
 * NOT transactions (ephemeral, off the undo stack).
 */

import type { LabelData } from "@fiftyone/utilities";

import type { AnnotationEngine } from "../core/engine";
import type { LabelRef, ScopedRef } from "../identity/ref";
import { toLabelRef } from "../identity/ref";
import { autoKeyframeOnGeometryEdit } from "./autoKeyframe";
import type { AdapterMap, SurfaceBridge } from "./types";

export interface SurfaceActions {
  /** Identifies the writer (debug/telemetry only). */
  readonly surface: string;

  /** Compound gestures (field-move, propagation): raw scoped ops, one atomic unit. */
  transaction<T>(fn: () => T, opts?: { undoKey?: string }): T;
  updateLabel(ref: ScopedRef, partial: Partial<LabelData>): void;
  createLabel(
    path: string,
    label: Partial<LabelData>,
    frame?: number,
  ): LabelRef;
  deleteLabel(ref: ScopedRef): void;

  /** Interaction write-half — maps select/hover gestures to engine state. */
  setActive(refs: readonly ScopedRef[], opts?: { additive?: boolean }): void;
  toggleActive(ref: ScopedRef, on?: boolean): void;
  setHovered(ref: ScopedRef, on: boolean): void;
}

/** Bridge controller = the shared write-half + handle-bound conveniences. */
export interface SurfaceController<Handle> extends SurfaceActions {
  /**
   * Existing-label edit: adapter dispatch → `toLabel` → `updateLabel`, in one
   * transaction. No-ops on an undefined handle or an empty/null partial.
   *
   * `undoKey` coalesces this commit with consecutive same-key commits into one
   * undo unit — a gesture whose commits straddle an async boundary (a mask
   * whose encode finalizes after the synchronous geometry commit) shares one
   * key so a single Ctrl-Z reverts the whole gesture.
   */
  commit(handle: Handle | undefined, opts?: { undoKey?: string }): void;

  /** Fresh create: mint instanceId, write, return the ref (caller re-ids its draft). */
  create(handle: Handle): LabelRef | undefined;

  /** Interaction gestures by handle: `refOf` + the SurfaceActions write. */
  selectHandle(
    handle: Handle | undefined,
    opts?: { additive?: boolean; toggle?: boolean },
  ): void;
  hoverHandle(handle: Handle, on: boolean): void;
}

interface ActionDeps {
  engine: AnnotationEngine;
  surface: string;
  /** Ambient sample scope; resolved per call so it tracks store registration. */
  getSample: () => string;
}

export const createSurfaceActions = ({
  engine,
  surface,
  getSample,
}: ActionDeps): SurfaceActions => {
  const bind = (ref: ScopedRef): LabelRef => toLabelRef(getSample(), ref);

  return {
    surface,
    transaction: (fn, opts) => engine.transaction(fn, opts),
    updateLabel: (ref, partial) => engine.updateLabel(bind(ref), partial),
    createLabel: (path, label, frame) =>
      engine.scope(getSample()).createLabel(path, label, frame),
    deleteLabel: (ref) => engine.deleteLabel(bind(ref)),

    setActive: (refs, opts) => {
      if (opts?.additive) {
        for (const ref of refs) {
          engine.interaction.toggleActive(bind(ref), true);
        }

        return;
      }

      engine.interaction.setActive(refs.map(bind));
    },
    toggleActive: (ref, on) => engine.interaction.toggleActive(bind(ref), on),
    setHovered: (ref, on) => engine.interaction.setHovered(bind(ref), on),
  };
};

interface ControllerDeps<Handle, Descriptor> {
  engine: AnnotationEngine;
  bridge: SurfaceBridge<Handle, Descriptor>;
  adapters: AdapterMap<Handle, Descriptor>;
}

export const createSurfaceController = <Handle, Descriptor>({
  engine,
  bridge,
  adapters,
}: ControllerDeps<Handle, Descriptor>): SurfaceController<Handle> => {
  const actions = createSurfaceActions({
    engine,
    surface: bridge.surface,
    getSample: () => bridge.sample,
  });

  const toPartial = (handle: Handle): Partial<LabelData> | null => {
    const scoped = bridge.refOf(handle);
    const adapter = adapters[engine.getLabelType(scoped.path)];

    if (!adapter) {
      return null;
    }

    return adapter.toLabel(handle);
  };

  return {
    ...actions,

    commit: (handle, opts) => {
      if (handle === undefined) {
        return;
      }

      const rawPartial = toPartial(handle);

      if (!rawPartial || Object.keys(rawPartial).length === 0) {
        return;
      }

      const ref = bridge.refOf(handle);
      const partial = autoKeyframeOnGeometryEdit(ref.path, rawPartial);

      // origin suppression: the loop must not echo this surface's own
      // write back onto the handle — the handle may hold state newer than
      // the committed label (e.g. a mask whose encode is still in flight)
      bridge.isWriting = true;

      try {
        if (opts?.undoKey) {
          actions.transaction(() => actions.updateLabel(ref, partial), {
            undoKey: opts.undoKey,
          });
        } else {
          actions.updateLabel(ref, partial);
        }
      } finally {
        bridge.isWriting = false;
      }
    },

    create: (handle) => {
      const partial = toPartial(handle);

      if (!partial) {
        return undefined;
      }

      const scoped = bridge.refOf(handle);
      bridge.isWriting = true;

      try {
        return actions.createLabel(scoped.path, partial, scoped.frame);
      } finally {
        bridge.isWriting = false;
      }
    },

    selectHandle: (handle, opts) => {
      if (handle === undefined) {
        actions.setActive([]);
        return;
      }

      const scoped = bridge.refOf(handle);

      if (opts?.toggle) {
        actions.toggleActive(scoped);
        return;
      }

      if (opts?.additive) {
        actions.toggleActive(scoped, true);
        return;
      }

      actions.setActive([scoped]);
    },

    hoverHandle: (handle, on) => actions.setHovered(bridge.refOf(handle), on),
  };
};
