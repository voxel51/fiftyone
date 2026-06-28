/**
 * The engine-derived read-half: one loop turns the semantic
 * change stream (+ temporal presence for frame-locked bridges) into silent
 * mount/update/unmount calls on a registered bridge. The surface writes none
 * of it.
 *
 * A whole-sample reset RECONCILES — unmount refs gone from the refreshed
 * data, reproject survivors onto their existing handles, mount newcomers.
 * Resets are routine (`setData` follows every successful persist), so a
 * teardown-and-rebuild would churn every handle once per autosave. Initial
 * registration runs the same reconcile (no handles yet → mounts everything),
 * so first-mount hydration is the same code path.
 */

import type { LabelData, LabelType } from "@fiftyone/utilities";

import type { AnnotationEngine } from "../core/engine";
import type { LabelRef } from "../identity/ref";
import { refKey, refsEqual, toLabelRef } from "../identity/ref";
import type { LabelChange } from "../store/types";
import { isWholeSampleReset } from "../store/types";
import type { AdapterMap, LabelKindAdapter, SurfaceBridge } from "./types";

export const registerBridgeLoop = <Handle, Descriptor>(
  engine: AnnotationEngine,
  bridge: SurfaceBridge<Handle, Descriptor>,
  adapters: AdapterMap<Handle, Descriptor>,
): (() => void) => {
  const kinds = Object.keys(adapters) as LabelType[];

  const adapterFor = (
    path: string,
  ): LabelKindAdapter<Handle, Descriptor> | undefined =>
    adapters[engine.getLabelType(path)];

  const inScope = (ref: LabelRef): boolean =>
    ref.sample === bridge.sample &&
    (bridge.paths === undefined || bridge.paths.has(ref.path));

  /** Refs known to have a live handle — the reconcile ledger for resets.
   *  Stale entries are harmless: `resolveHandle` re-checks before unmount. */
  const known = new Map<string, LabelRef>();

  /** Every mount path applies current interaction state to the fresh handle. */
  const applyInteraction = (handle: Handle, ref: LabelRef): void => {
    const { interaction } = engine;
    bridge.applySelected?.(handle, interaction.isActive(ref));
    bridge.applyHovered?.(handle, interaction.isHovered(ref));
    const anchor = interaction.getAnchor();
    bridge.applyAnchor?.(handle, !!anchor && refsEqual(anchor, ref));
  };

  const mountFresh = (
    ref: LabelRef,
    label: LabelData,
    adapter: LabelKindAdapter<Handle, Descriptor>,
  ): void => {
    const handle = bridge.mount(adapter.buildHandle(ref, label));

    // undefined = gated on an async source; the bridge reports the late
    // insert via onDeferredMount and interaction state applies then
    if (handle !== undefined) {
      applyInteraction(handle, ref);
    }
  };

  const unmountRef = (ref: LabelRef): void => {
    const handle = bridge.resolveHandle(ref);

    if (handle !== undefined) {
      bridge.unmount(handle);
    }

    known.delete(refKey(ref));
  };

  /** Re-read current state and reconcile one ref onto the surface. */
  const reproject = (ref: LabelRef): void => {
    const adapter = adapterFor(ref.path);

    if (!adapter) {
      return;
    }

    const handle = bridge.resolveHandle(ref);
    const label = engine.getLabel(ref);

    if (!label) {
      // deleted or resolved away
      unmountRef(ref);
      return;
    }

    if (adapter.renders && !adapter.renders(label)) {
      // out of content scope for this surface — unmount covers a label
      // whose data just transitioned out; a no-op when it was never mounted
      unmountRef(ref);
      return;
    }

    known.set(refKey(ref), ref);

    if (handle !== undefined) {
      adapter.updateHandle(handle, label);
      return;
    }

    // create-from-engine falls out of the same branch
    mountFresh(ref, label, adapter);
  };

  /** Current refs by temporal posture: present subset vs. whole pool. */
  const currentRefs = (): LabelRef[] => {
    const refs =
      bridge.temporal === "pool"
        ? engine.enumerateLabels(kinds)
        : engine.temporal
            .getPresent()
            .filter((ref) => kinds.includes(engine.getLabelType(ref.path)));

    return refs.filter(inScope);
  };

  /**
   * The whole-sample-reset branch: reconcile, don't rebuild.
   * Survivors keep their handles (silent re-apply), so a post-persist
   * `setData` refresh is visually a no-op.
   */
  const reconcile = (): void => {
    const current = currentRefs();
    const currentKeys = new Set(current.map(refKey));

    for (const [key, ref] of [...known]) {
      if (!currentKeys.has(key)) {
        unmountRef(ref);
      }
    }

    for (const ref of current) {
      reproject(ref);
    }
  };

  const onChanges = (changes: readonly LabelChange[]): void => {
    if (bridge.isWriting) {
      return;
    }

    for (const change of changes) {
      if (change.ref.sample !== bridge.sample) {
        continue;
      }

      // A whole-sample reset (setData/clear) carries the empty-path sentinel, so
      // it never satisfies the `paths` scope — test it BEFORE that filter, keyed
      // on `sample` alone (§6.1). Otherwise a path-scoped bridge — every modal
      // bridge — would drop the post-persist reconcile and leave stale handles.
      if (isWholeSampleReset(change)) {
        reconcile();
        continue;
      }

      if (!inScope(change.ref)) {
        continue;
      }

      // A frame-locked surface shows only the present subset, so an edit,
      // delete, or add on a frame other than the playhead's is real in the
      // store but must not touch the canvas — the presence merge surfaces it
      // when the clock arrives. Gated to genuinely temporal engines: under the
      // pool view presence ≡ existence, where a delete must still unmount.
      if (
        bridge.temporal !== "pool" &&
        engine.temporal.isTemporal &&
        !engine.temporal.isPresent(change.ref)
      ) {
        continue;
      }

      if (change.kind === "delete") {
        unmountRef(change.ref);
        continue;
      }

      // update OR per-ref reset: re-read & apply
      reproject(change.ref);
    }
  };

  // interaction read-half: diff the sets, apply silently per handle
  let prevActive = new Map<string, LabelRef>();
  let prevHovered = new Map<string, LabelRef>();
  let prevAnchor: LabelRef | undefined;

  /**
   * Only this bridge's adapted kinds — interaction state can include refs for
   * kinds another surface owns on the same scene (a video tile's sample-level
   * temporal detection shares the scene with frame detections; the video
   * bridge adapts the latter but not the former). Calling `resolveHandle` for
   * a foreign-kind ref would silently `managed.add` its overlay, so a later
   * `clear()` (bridge re-create on a `paths` churn — e.g. a sidebar
   * Classification toggle) would evict it from the scene even though this
   * surface never owned it. Mirrors `onPresence`'s adapter gate (§284).
   */
  const adaptsKind = (ref: LabelRef): boolean =>
    kinds.includes(engine.getLabelType(ref.path));

  const applyFlag = (
    apply: ((handle: Handle, on: boolean) => void) | undefined,
    prev: Map<string, LabelRef>,
    next: Map<string, LabelRef>,
  ): void => {
    if (!apply) {
      return;
    }

    for (const [key, ref] of prev) {
      if (!next.has(key) && inScope(ref) && adaptsKind(ref)) {
        const handle = bridge.resolveHandle(ref);

        if (handle !== undefined) {
          apply.call(bridge, handle, false);
        }
      }
    }

    for (const [key, ref] of next) {
      if (!prev.has(key) && inScope(ref) && adaptsKind(ref)) {
        const handle = bridge.resolveHandle(ref);

        if (handle !== undefined) {
          apply.call(bridge, handle, true);
        }
      }
    }
  };

  const onInteraction = (): void => {
    const { interaction } = engine;
    const nextActive = new Map(
      interaction.getActive().map((ref) => [refKey(ref), ref]),
    );
    const nextHovered = new Map(
      interaction.getHovered().map((ref) => [refKey(ref), ref]),
    );
    const nextAnchor = interaction.getAnchor();

    applyFlag(bridge.applySelected, prevActive, nextActive);
    applyFlag(bridge.applyHovered, prevHovered, nextHovered);

    if (bridge.applyAnchor) {
      const changed =
        prevAnchor !== nextAnchor &&
        !(prevAnchor && nextAnchor && refsEqual(prevAnchor, nextAnchor));

      if (changed) {
        for (const [ref, on] of [
          [prevAnchor, false],
          [nextAnchor, true],
        ] as const) {
          if (ref && inScope(ref) && adaptsKind(ref)) {
            const handle = bridge.resolveHandle(ref);

            if (handle !== undefined) {
              bridge.applyAnchor(handle, on);
            }
          }
        }
      }
    }

    prevActive = nextActive;
    prevHovered = nextHovered;
    prevAnchor = nextAnchor;
  };

  // presence merge (frame-locked only): enter → mount, exit → unmount,
  // refresh → re-read + update. Inert when non-temporal (presence ≡ pool).
  const onPresence =
    bridge.temporal === "pool"
      ? undefined
      : engine.subscribePresence((events) => {
          if (bridge.isWriting) {
            return;
          }

          const exited: LabelRef[] = [];

          for (const event of events) {
            if (!inScope(event.ref)) {
              continue;
            }

            // Only act on kinds this bridge adapts; unmounting a foreign-owned
            // ref (e.g. a temporal detection) is unrecoverable — reproject can't
            // re-add it without an adapter.
            if (!kinds.includes(engine.getLabelType(event.ref.path))) {
              continue;
            }

            if (event.kind === "exit") {
              unmountRef(event.ref);
              exited.push(event.ref);
              continue;
            }

            reproject(event.ref);
          }

          // scrubbing a label off-frame prunes its hover (the overlay under the
          // cursor vanished) but never its selection — active/anchor survive.
          if (exited.length > 0) {
            engine.interaction.pruneHovered(exited);
          }
        });

  // gated mounts insert after their async source resolves — apply
  // interaction state to the late handle, as every other mount path does
  bridge.onDeferredMount = (handle) => {
    applyInteraction(handle, toLabelRef(bridge.sample, bridge.refOf(handle)));
  };

  // initial registration = the whole-sample-reset branch, for this bridge
  // only: an empty ledger degenerates reconcile to mount-everything
  reconcile();
  onInteraction();

  const unsubscribeChanges = engine.subscribeChanges(onChanges);
  const unsubscribeInteraction = engine.interaction.subscribe(onInteraction);

  return () => {
    bridge.onDeferredMount = undefined;
    unsubscribeChanges();
    unsubscribeInteraction();
    onPresence?.();
  };
};
