/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Chord } from "./chords";
import { chordMatchesEvent, formatChord, parseChord } from "./chords";
import { DismissalStack } from "./dismiss";
import type { CommandManifestEntry } from "./manifest";
import { MANIFEST, MANIFEST_BY_ID } from "./manifest";
import type { OverrideMap } from "./overrides";
import {
  DEFAULT_PRESET,
  loadFromStorage,
  resolveKeymap,
  saveToStorage,
} from "./overrides";
import type { ScopeId } from "./scopes";
import { ROOT_SCOPE, isScopeReachable, scopeDepth } from "./scopes";
import { isTextEditingTarget } from "./textInput";

/**
 * The one command that isn't dispatched to a handler. It resolves against the
 * dismissal stack instead — see §4.6 and `DismissalStack`.
 */
const DISMISS_COMMAND_ID = "fo.dismiss";

/** A handler attached to a declared command. Declaration ≠ binding (§4.4). */
export interface Binding {
  commandId: string;
  handler: (event: KeyboardEvent) => void;
  /** Static predicate — VS Code's `when` clause, in JS. */
  enablement: () => boolean;
  /** Registration order, the final tiebreak. */
  seq: number;
}

/** Why a candidate did or didn't win, for the demo readout and the pane. */
export type CandidateStatus =
  | "would-fire"
  | "scope-inactive"
  | "unbound"
  | "disabled"
  | "suppressed-in-text-input"
  | "suppressed-not-repeatable"
  | "shadowed";

export interface Candidate {
  entry: CommandManifestEntry;
  chord: string;
  status: CandidateStatus;
  scopeDepth: number;
  priority: number;
}

/**
 * The whole keyboard pipeline, as one capture-phase listener (doc §4.1).
 *
 * Capture rather than bubble for the reason F2 documents: the existing bus
 * listens on bubble, so its `stopPropagation()` cannot stop the ~60 sibling
 * `document` handlers, and three separate authors independently worked around
 * that with `{capture: true}` and `stopImmediatePropagation()`. On capture,
 * arbitration happens before any of them run and suppression is authoritative.
 *
 * Precedence, per §4.3:
 *   1. deepest active scope first
 *   2. within a scope, `priority` descending
 *   3. then registration order
 *   4. first candidate whose `enablement()` passes consumes the event
 */
export class KeymapRegistry {
  private static _instance: KeymapRegistry | undefined;

  /** Refcounted, because two components may legitimately hold the same scope. */
  private scopeCounts = new Map<ScopeId, number>();
  private bindings = new Map<string, Binding[]>();
  private seq = 0;

  private presetName = DEFAULT_PRESET;
  private userOverrides: OverrideMap = {};

  /** Parsed chord cache, so `parseBinding` is not re-run per keystroke (F9). */
  private chordCache = new Map<string, Chord>();
  /** Serialized chord → commands, rebuilt only when the keymap changes. */
  private index = new Map<string, CommandManifestEntry[]>();

  private listeners = new Set<() => void>();
  private lastDispatch: { chord: string; candidates: Candidate[] } | null =
    null;

  public readonly dismissal = new DismissalStack();

  private constructor() {
    const stored = loadFromStorage();
    this.presetName = stored.preset;
    this.userOverrides = stored.overrides;
    this.rebuildIndex();

    // The root scope is always live; everything else is pushed by its owner.
    this.scopeCounts.set(ROOT_SCOPE, 1);

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.handleKeyDown, {
        capture: true,
      });
    }
  }

  public static instance(): KeymapRegistry {
    if (!KeymapRegistry._instance) {
      KeymapRegistry._instance = new KeymapRegistry();
    }
    return KeymapRegistry._instance;
  }

  // ── Scopes ───────────────────────────────────────────────────────────────

  /** Push a scope; returns the pop. Replaces the no-op `pushContext` (F1). */
  public pushScope(scope: ScopeId): () => void {
    this.scopeCounts.set(scope, (this.scopeCounts.get(scope) ?? 0) + 1);
    this.notify();
    let popped = false;
    return () => {
      if (popped) {
        return;
      }
      popped = true;
      const next = (this.scopeCounts.get(scope) ?? 1) - 1;
      if (next <= 0) {
        this.scopeCounts.delete(scope);
      } else {
        this.scopeCounts.set(scope, next);
      }
      this.notify();
    };
  }

  public activeScopes(): ReadonlySet<ScopeId> {
    return new Set(this.scopeCounts.keys());
  }

  public isReachable(scope: ScopeId): boolean {
    return isScopeReachable(scope, this.activeScopes());
  }

  // ── Bindings ─────────────────────────────────────────────────────────────

  /** Attach a handler to a declared command; returns the unbind. */
  public bind(
    commandId: string,
    handler: (event: KeyboardEvent) => void,
    enablement: () => boolean = () => true,
  ): () => void {
    if (!MANIFEST_BY_ID.has(commandId)) {
      // Dev-time guard: a binding for an undeclared command would be invisible
      // to the settings pane, which is exactly the drift this design removes.
      throw new Error(
        `"${commandId}" is not in the command manifest. Declare it in manifest.ts before binding a handler.`,
      );
    }
    const binding: Binding = {
      commandId,
      handler,
      enablement,
      seq: this.seq++,
    };
    const existing = this.bindings.get(commandId) ?? [];
    this.bindings.set(commandId, [...existing, binding]);
    this.notify();
    return () => {
      const current = this.bindings.get(commandId);
      if (!current) {
        return;
      }
      const next = current.filter((entry) => entry !== binding);
      if (next.length === 0) {
        this.bindings.delete(commandId);
      } else {
        this.bindings.set(commandId, next);
      }
      this.notify();
    };
  }

  public isBound(commandId: string): boolean {
    if (commandId === DISMISS_COMMAND_ID) {
      // Its "handler" is the dismissal stack, so it's live whenever some layer
      // is listening — otherwise the pane would claim Escape does nothing.
      return this.dismissal.snapshot().length > 0;
    }
    return (this.bindings.get(commandId)?.length ?? 0) > 0;
  }

  // ── Keymap state ─────────────────────────────────────────────────────────

  public getPreset(): string {
    return this.presetName;
  }

  public getOverrides(): OverrideMap {
    return this.userOverrides;
  }

  public setPreset(presetName: string): void {
    this.presetName = presetName;
    this.commit();
  }

  public setOverrides(overrides: OverrideMap): void {
    this.userOverrides = overrides;
    this.commit();
  }

  public setKeys(commandId: string, keys: readonly string[]): void {
    this.setOverrides({ ...this.userOverrides, [commandId]: [...keys] });
  }

  /** Drop the override so the command falls back to preset/default. */
  public restore(commandId: string): void {
    const next = { ...this.userOverrides };
    delete next[commandId];
    this.setOverrides(next);
  }

  public restoreAll(): void {
    this.setOverrides({});
  }

  public resolved() {
    return resolveKeymap(this.presetName, this.userOverrides);
  }

  private commit(): void {
    this.rebuildIndex();
    saveToStorage(this.presetName, this.userOverrides);
    this.notify();
  }

  private chordFor(serialized: string): Chord | null {
    const cached = this.chordCache.get(serialized);
    if (cached) {
      return cached;
    }
    try {
      const chord = parseChord(serialized);
      this.chordCache.set(serialized, chord);
      return chord;
    } catch {
      return null;
    }
  }

  private rebuildIndex(): void {
    this.index = new Map();
    for (const binding of this.resolved()) {
      for (const key of binding.keys) {
        const chord = this.chordFor(key);
        if (!chord) {
          continue;
        }
        const normalized = formatChord(chord);
        const existing = this.index.get(normalized) ?? [];
        this.index.set(normalized, [...existing, binding.entry]);
      }
    }
  }

  // ── Resolution ───────────────────────────────────────────────────────────

  /**
   * Everything a chord *could* do right now, best candidate first, each
   * annotated with why it would or wouldn't fire. This is the introspection
   * §4.3 argues for: because candidates are ranked by static data and static
   * predicates, the settings pane can answer "what does this key do" honestly.
   */
  public explain(event: KeyboardEvent): Candidate[] {
    const active = this.activeScopes();
    const editing = isTextEditingTarget(document.activeElement);

    const matched: Candidate[] = [];
    for (const [serialized, entries] of this.index) {
      const chord = this.chordFor(serialized);
      if (!chord || !chordMatchesEvent(chord, event)) {
        continue;
      }
      for (const entry of entries) {
        matched.push({
          entry,
          chord: serialized,
          status: "would-fire",
          scopeDepth: scopeDepth(entry.scope),
          priority: entry.priority ?? 0,
        });
      }
    }

    matched.sort((a, b) => {
      if (a.scopeDepth !== b.scopeDepth) {
        return b.scopeDepth - a.scopeDepth;
      }
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      const aSeq =
        this.bindings.get(a.entry.id)?.[0]?.seq ?? Number.MAX_SAFE_INTEGER;
      const bSeq =
        this.bindings.get(b.entry.id)?.[0]?.seq ?? Number.MAX_SAFE_INTEGER;
      return aSeq - bSeq;
    });

    let winnerFound = false;
    return matched.map((candidate) => {
      const { entry } = candidate;
      let status: CandidateStatus = "would-fire";

      if (!isScopeReachable(entry.scope, active)) {
        status = "scope-inactive";
      } else if (editing && !entry.allowInTextInput) {
        status = "suppressed-in-text-input";
      } else if (event.repeat && !entry.repeatable) {
        status = "suppressed-not-repeatable";
      } else if (entry.id === DISMISS_COMMAND_ID) {
        // Dismiss has no handler of its own — the dismissal stack *is* its
        // handler, so it counts as bound exactly when some layer is listening.
        if (this.dismissal.snapshot().length === 0) {
          status = "unbound";
        } else if (winnerFound) {
          status = "shadowed";
        } else {
          winnerFound = true;
          status = "would-fire";
        }
      } else {
        const bindings = this.bindings.get(entry.id) ?? [];
        const enabled = bindings.filter((binding) => binding.enablement());
        if (bindings.length === 0) {
          status = "unbound";
        } else if (enabled.length === 0) {
          status = "disabled";
        } else if (winnerFound) {
          status = "shadowed";
        } else {
          winnerFound = true;
          status = "would-fire";
        }
      }

      return { ...candidate, status };
    });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const candidates = this.explain(event);
    const winner = candidates.find(
      (candidate) => candidate.status === "would-fire",
    );

    this.lastDispatch = candidates.length
      ? { chord: candidates[0].chord, candidates }
      : null;

    if (!winner) {
      if (candidates.length) {
        this.notify();
      }
      return;
    }

    // `fo.dismiss` is not a normal command: it delegates to the dismissal
    // stack, and only counts as consumed if some layer actually took it.
    if (winner.entry.id === DISMISS_COMMAND_ID) {
      const result = this.dismissal.dismiss();
      this.notify();
      if (!result.consumedBy) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const binding = (this.bindings.get(winner.entry.id) ?? []).find((entry) =>
      entry.enablement(),
    );
    if (!binding) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    binding.handler(event);
    this.notify();
  };

  /**
   * Detaches the listener and clears the singleton. Production never calls
   * this — the registry lives for the life of the page — but without it a test
   * that resets the singleton leaves the previous instance's capture listener
   * attached, and the orphan consumes events the new instance should see.
   */
  public dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.handleKeyDown, {
        capture: true,
      });
    }
    this.listeners.clear();
    if (KeymapRegistry._instance === this) {
      KeymapRegistry._instance = undefined;
    }
  }

  /** The most recent matched chord and its ranking, for the demo readout. */
  public lastResolution(): { chord: string; candidates: Candidate[] } | null {
    return this.lastDispatch;
  }

  // ── Subscription ─────────────────────────────────────────────────────────

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

export const keymap = (): KeymapRegistry => KeymapRegistry.instance();

/** Every declared command, whether or not anything is currently bound to it. */
export const allCommands = (): readonly CommandManifestEntry[] => MANIFEST;
