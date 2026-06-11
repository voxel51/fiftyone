/**
 * Engine-owned ephemeral interaction state (spec §6.5 / D5): the active
 * (selection) set with its engine-owned anchor, and the hover set. NOT a
 * LabelStore — never persisted, never dirty, never patched. Singleton per
 * session; keyed on full identity (D1). GC'd against the semantic change
 * stream (engine bookkeeping); presence `exit` prunes hover only (§4.1).
 */

import type { LabelRef } from "../identity/ref";
import { refKey } from "../identity/ref";
import type { LabelChange } from "../store/types";
import { isWholeSampleReset } from "../store/types";
import { DispatchGuard } from "../core/dispatchGuard";

export class InteractionState {
  private active = new Map<string, LabelRef>();
  private hovered = new Map<string, LabelRef>();
  private anchorRef: LabelRef | undefined;
  private listeners = new Set<() => void>();
  private version = 0;
  private guard: DispatchGuard;

  // cached projections so repeated reads are referentially stable
  private activeList: readonly LabelRef[] | null = null;
  private hoveredList: readonly LabelRef[] | null = null;

  constructor(guard: DispatchGuard = new DispatchGuard()) {
    this.guard = guard;
  }

  // ---- active set + anchor ----

  getActive(): readonly LabelRef[] {
    if (!this.activeList) {
      this.activeList = [...this.active.values()];
    }

    return this.activeList;
  }

  isActive(ref: LabelRef): boolean {
    return this.active.has(refKey(ref));
  }

  /** Replace the active set; the anchor becomes the last ref (or clears). */
  setActive(refs: readonly LabelRef[]): void {
    this.guard.assert("InteractionState.setActive");
    const next = new Map(refs.map((ref) => [refKey(ref), ref]));
    const nextAnchor = refs.length > 0 ? refs[refs.length - 1] : undefined;

    if (this.sameRefs(this.active, next) && this.sameAnchor(nextAnchor)) {
      return;
    }

    this.active = next;
    this.anchorRef = nextAnchor;
    this.notify();
  }

  /** Additive (cmd-click) membership toggle; adding moves the anchor. */
  toggleActive(ref: LabelRef, on?: boolean): void {
    this.guard.assert("InteractionState.toggleActive");
    const key = refKey(ref);
    const add = on ?? !this.active.has(key);

    if (add) {
      if (this.active.has(key) && this.sameAnchor(ref)) {
        return;
      }

      this.active.set(key, ref);
      this.anchorRef = ref;
    } else {
      if (!this.active.has(key)) {
        return;
      }

      this.active.delete(key);
      this.promoteAnchorIfWas(key);
    }

    this.notify();
  }

  getAnchor(): LabelRef | undefined {
    return this.anchorRef;
  }

  /** Move the lead without mutating the set (keyboard nav). INVARIANT: anchor ∈ active. */
  setAnchor(ref: LabelRef | undefined): void {
    this.guard.assert("InteractionState.setAnchor");

    if (ref && !this.active.has(refKey(ref))) {
      throw new Error("anchor must be a member of the active set");
    }

    if (this.sameAnchor(ref)) {
      return;
    }

    this.anchorRef = ref;
    this.notify();
  }

  // ---- hover set ----

  getHovered(): readonly LabelRef[] {
    if (!this.hoveredList) {
      this.hoveredList = [...this.hovered.values()];
    }

    return this.hoveredList;
  }

  isHovered(ref: LabelRef): boolean {
    return this.hovered.has(refKey(ref));
  }

  setHovered(ref: LabelRef, on: boolean): void {
    this.guard.assert("InteractionState.setHovered");
    const key = refKey(ref);

    if (on === this.hovered.has(key)) {
      return;
    }

    if (on) {
      this.hovered.set(key, ref);
    } else {
      this.hovered.delete(key);
    }

    this.notify();
  }

  // ---- observability (level-triggered + coalesced, §6.5) ----

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getVersion(): number {
    return this.version;
  }

  // ---- engine-internal bookkeeping (not part of the public surface) ----

  /**
   * GC against the SEMANTIC change stream (D5 review amendment): a delete
   * prunes the ref from active/hover and promotes the anchor; a whole-sample
   * reset prunes everything belonging to that sample. Runs inside the
   * engine's dispatch (sanctioned bookkeeping), coalesced to one notify.
   */
  gc(changes: readonly LabelChange[]): void {
    let pruned = false;

    for (const change of changes) {
      if (isWholeSampleReset(change)) {
        pruned = this.pruneSample(change.ref.sample) || pruned;
        continue;
      }

      if (change.kind !== "delete") {
        continue;
      }

      pruned = this.prune(refKey(change.ref)) || pruned;
    }

    if (pruned) {
      this.notify();
    }
  }

  /**
   * Presence `exit` prunes hover ONLY (§4.1/§6.5): the overlay under the
   * cursor vanished, but scrubbing never deselects — active/anchor survive.
   */
  pruneHovered(refs: readonly LabelRef[]): void {
    let pruned = false;

    for (const ref of refs) {
      pruned = this.hovered.delete(refKey(ref)) || pruned;
    }

    if (pruned) {
      this.hoveredList = null;
      this.notify();
    }
  }

  // ---- internals ----

  private prune(key: string): boolean {
    const inActive = this.active.delete(key);
    const inHovered = this.hovered.delete(key);

    if (inActive) {
      this.promoteAnchorIfWas(key);
    }

    return inActive || inHovered;
  }

  private pruneSample(sample: string): boolean {
    let pruned = false;

    for (const [key, ref] of [...this.active]) {
      if (ref.sample === sample) {
        this.active.delete(key);
        this.promoteAnchorIfWas(key);
        pruned = true;
      }
    }

    for (const [key, ref] of [...this.hovered]) {
      if (ref.sample === sample) {
        this.hovered.delete(key);
        pruned = true;
      }
    }

    return pruned;
  }

  /** Deleted member was the anchor → promote to another member, or clear. */
  private promoteAnchorIfWas(key: string): void {
    if (!this.anchorRef || refKey(this.anchorRef) !== key) {
      return;
    }

    const remaining = [...this.active.values()];
    this.anchorRef = remaining[remaining.length - 1];
  }

  private sameAnchor(ref: LabelRef | undefined): boolean {
    if (!this.anchorRef || !ref) {
      return this.anchorRef === ref;
    }

    return refKey(this.anchorRef) === refKey(ref);
  }

  private sameRefs(
    a: Map<string, LabelRef>,
    b: Map<string, LabelRef>
  ): boolean {
    if (a.size !== b.size) {
      return false;
    }

    for (const key of a.keys()) {
      if (!b.has(key)) {
        return false;
      }
    }

    return true;
  }

  private notify(): void {
    this.version++;
    this.activeList = null;
    this.hoveredList = null;

    this.guard.run(() => {
      for (const listener of this.listeners) {
        listener();
      }
    });
  }
}
