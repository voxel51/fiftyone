/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ScopeId } from "./scopes";
import { scopeDepth } from "./scopes";

/**
 * Escape is not a shortcut (doc §4.6). The app currently has at least twenty
 * independent Escape handlers, two capture-phase interceptors bolted on to win
 * races, and a priority 100/200/300 ladder in `useAnnotationActions.tsx` that
 * is a dismissal stack encoded as magic numbers.
 *
 * This is that stack, made explicit. Each transient UI pushes a dismisser;
 * Escape pops exactly one, innermost first. The precedent is `CloseWatcher`
 * and `<dialog>`'s close-request behaviour.
 *
 * A dismisser returning `false` is a deliberately narrow `PASS_THROUGH`: it can
 * decline, but declining is all it can do, so the keymap stays introspectable
 * in a way arbitrary runtime declining would not (§4.3).
 */
export interface Dismisser {
  id: string;
  /** Human label, so the demo route and devtools can show the live stack. */
  label: string;
  /** The scope that owns this layer; the primary ordering key. */
  scope: ScopeId;
  /** Returns true when it consumed the dismissal. */
  dismiss: () => boolean;
}

interface StackEntry extends Dismisser {
  /** Push order, the tiebreak within a scope. */
  seq: number;
}

export interface DismissalResult {
  /** The dismisser that consumed it, if any. */
  consumedBy: Dismisser | null;
  /** Dismissers that were asked and declined, outermost-last. */
  declined: Dismisser[];
}

export class DismissalStack {
  private entries: StackEntry[] = [];
  private seq = 0;
  private listeners = new Set<() => void>();

  public push(dismisser: Dismisser): () => void {
    const entry: StackEntry = { ...dismisser, seq: this.seq++ };
    this.entries = [...this.entries, entry];
    this.notify();
    let removed = false;
    return () => {
      if (removed) {
        return;
      }
      removed = true;
      this.entries = this.entries.filter((candidate) => candidate !== entry);
      this.notify();
    };
  }

  /**
   * Innermost first — the order Escape consults them.
   *
   * Ordered by **scope depth**, not push order, for the same reason §4.3 makes
   * depth the primary precedence axis. Push order alone would be wrong here:
   * React runs child effects before parent effects, so a nested layer pushes
   * itself *before* the layer that visually contains it. Depth is derived from
   * the tree and doesn't care when a mount happened; push order only breaks ties
   * within one scope, where later-pushed is more recent and therefore innermost.
   */
  public snapshot(): readonly Dismisser[] {
    return [...this.entries].sort((a, b) => {
      const depthDelta = scopeDepth(b.scope) - scopeDepth(a.scope);
      return depthDelta !== 0 ? depthDelta : b.seq - a.seq;
    });
  }

  public dismiss(): DismissalResult {
    const declined: Dismisser[] = [];
    for (const dismisser of this.snapshot()) {
      if (dismisser.dismiss()) {
        return { consumedBy: dismisser, declined };
      }
      declined.push(dismisser);
    }
    return { consumedBy: null, declined };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
