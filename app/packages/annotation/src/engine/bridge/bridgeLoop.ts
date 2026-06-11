/**
 * The engine-derived read-half (spec §6.1): one loop turns the semantic
 * change stream (+ temporal presence for frame-locked bridges) into silent
 * mount/update/unmount calls on a registered bridge. The surface writes none
 * of it. Initial registration performs the whole-sample-reset branch directly
 * (clear + hydrate), so first-mount hydration is the same code path.
 */

import type { LabelData, LabelType } from "@fiftyone/utilities";

import type { AnnotationEngine } from "../core/engine";
import type { LabelRef } from "../identity/ref";
import { refKey, refsEqual } from "../identity/ref";
import type { LabelChange } from "../store/types";
import { isWholeSampleReset } from "../store/types";
import type { AdapterMap, LabelKindAdapter, SurfaceBridge } from "./types";

export const registerBridgeLoop = <Handle, Descriptor>(
  engine: AnnotationEngine,
  bridge: SurfaceBridge<Handle, Descriptor>,
  adapters: AdapterMap<Handle, Descriptor>
): (() => void) => {
  const kinds = Object.keys(adapters) as LabelType[];

  const adapterFor = (
    path: string
  ): LabelKindAdapter<Handle, Descriptor> | undefined =>
    adapters[engine.getLabelType(path)];

  const inScope = (ref: LabelRef): boolean =>
    bridge.sample === undefined || ref.sample === bridge.sample;

  /** Every mount path applies current interaction state to the fresh handle (§6.1). */
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
    adapter: LabelKindAdapter<Handle, Descriptor>
  ): void => {
    const handle = bridge.mount(adapter.buildHandle(ref, label));
    applyInteraction(handle, ref);
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
      if (handle !== undefined) {
        bridge.unmount(handle);
      }

      return;
    }

    if (handle !== undefined) {
      adapter.updateHandle(handle, label);
      return;
    }

    // create-from-engine falls out of the same branch (§6.1)
    mountFresh(ref, label, adapter);
  };

  /** Hydrate by temporal posture: present subset vs. whole pool (§6.1). */
  const hydrate = (): void => {
    const refs =
      bridge.temporal === "pool"
        ? engine.enumerateLabels(kinds)
        : engine.temporal
            .getPresent()
            .filter((ref) => kinds.includes(engine.getLabelType(ref.path)));

    for (const ref of refs) {
      if (!inScope(ref)) {
        continue;
      }

      const adapter = adapterFor(ref.path);
      const label = engine.getLabel(ref);

      if (adapter && label) {
        mountFresh(ref, label, adapter);
      }
    }
  };

  const onChanges = (changes: readonly LabelChange[]): void => {
    if (bridge.isWriting) {
      return;
    }

    for (const change of changes) {
      if (!inScope(change.ref)) {
        continue;
      }

      if (isWholeSampleReset(change)) {
        bridge.clear();
        hydrate();
        continue;
      }

      if (change.kind === "delete") {
        const handle = bridge.resolveHandle(change.ref);

        if (handle !== undefined) {
          bridge.unmount(handle);
        }

        continue;
      }

      // update OR per-ref reset: re-read & apply
      reproject(change.ref);
    }
  };

  // interaction read-half (§6.5): diff the sets, apply silently per handle
  let prevActive = new Map<string, LabelRef>();
  let prevHovered = new Map<string, LabelRef>();
  let prevAnchor: LabelRef | undefined;

  const applyFlag = (
    apply: ((handle: Handle, on: boolean) => void) | undefined,
    prev: Map<string, LabelRef>,
    next: Map<string, LabelRef>
  ): void => {
    if (!apply) {
      return;
    }

    for (const [key, ref] of prev) {
      if (!next.has(key) && inScope(ref)) {
        const handle = bridge.resolveHandle(ref);

        if (handle !== undefined) {
          apply.call(bridge, handle, false);
        }
      }
    }

    for (const [key, ref] of next) {
      if (!prev.has(key) && inScope(ref)) {
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
      interaction.getActive().map((ref) => [refKey(ref), ref])
    );
    const nextHovered = new Map(
      interaction.getHovered().map((ref) => [refKey(ref), ref])
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
          if (ref && inScope(ref)) {
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

  // presence merge (§6.1, frame-locked only): enter → mount, exit → unmount,
  // refresh → re-read + update. Inert when non-temporal (presence ≡ pool).
  const onPresence =
    bridge.temporal === "pool"
      ? undefined
      : engine.temporal.subscribePresence((events) => {
          if (bridge.isWriting) {
            return;
          }

          for (const event of events) {
            if (!inScope(event.ref)) {
              continue;
            }

            if (event.kind === "exit") {
              const handle = bridge.resolveHandle(event.ref);

              if (handle !== undefined) {
                bridge.unmount(handle);
              }

              continue;
            }

            reproject(event.ref);
          }
        });

  // initial registration = the whole-sample-reset branch, for this bridge only
  bridge.clear();
  hydrate();
  onInteraction();

  const unsubscribeChanges = engine.subscribeChanges(onChanges);
  const unsubscribeInteraction = engine.interaction.subscribe(onInteraction);

  return () => {
    unsubscribeChanges();
    unsubscribeInteraction();
    onPresence?.();
  };
};
