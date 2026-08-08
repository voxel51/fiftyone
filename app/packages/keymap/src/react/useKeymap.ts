/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chord } from "../core/chords";
import { chordFromEvent, formatChord, isModifierCode } from "../core/chords";
import type { OverlapMap } from "../core/conflicts";
import { analyzeOverlaps } from "../core/conflicts";
import type { Dismisser } from "../core/dismiss";
import {
  ensureKeyboardLayout,
  subscribeToKeyboardLayout,
} from "../core/layout";
import type { ResolvedBinding } from "../core/overrides";
import type { Candidate } from "../core/registry";
import { keymap } from "../core/registry";
import type { ScopeId } from "../core/scopes";

/** Re-renders on any registry change: scopes, bindings, overrides, dismissals. */
export const useKeymapVersion = (): number => {
  const [version, setVersion] = useState(0);
  useEffect(
    () => keymap().subscribe(() => setVersion((current) => current + 1)),
    [],
  );
  return version;
};

/**
 * Pushes a scope while mounted. This is what makes the stack real (F1): the
 * existing `pushContext`/`popContext` are literal no-ops with the stack
 * hardcoded to three entries that are activated at construction and never
 * deactivated, which is why modal bindings are live while the modal is closed.
 */
export const useKeymapScope = (scope: ScopeId, active = true): void => {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return keymap().pushScope(scope);
  }, [scope, active]);
};

export interface KeyBindingOptions {
  /** Static predicate, evaluated before dispatch. */
  enablement?: () => boolean;
  /** Skip registration entirely — distinct from an enablement that returns false. */
  active?: boolean;
}

/**
 * Attaches a handler to a command *declared in the manifest*. The command's
 * label, scope, and default keys exist independently of this hook, so the
 * settings pane can list it whether or not this component is mounted (§4.4).
 */
export const useKeyBinding = (
  commandId: string,
  handler: (event: KeyboardEvent) => void,
  options: KeyBindingOptions = {},
): void => {
  const { active = true } = options;

  // Kept in refs so a new inline handler or predicate each render doesn't
  // churn the registration (and its registration order, which is a tiebreak).
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enablementRef = useRef(options.enablement);
  enablementRef.current = options.enablement;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return keymap().bind(
      commandId,
      (event) => handlerRef.current(event),
      () => enablementRef.current?.() ?? true,
    );
  }, [commandId, active]);
};

/**
 * Registers a *held* binding: `onChange(true)` on press, `onChange(false)` on
 * release. This is looker's `ControlEventKeyType.HOLD` — hold Shift to hide
 * overlays — which the bus could not express before (F9).
 *
 * Held bindings never consume the event, so the key keeps working as a
 * modifier for everything else while it is down.
 */
export const useHoldBinding = (
  commandId: string,
  onChange: (held: boolean) => void,
  options: KeyBindingOptions = {},
): void => {
  const { active = true } = options;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const enablementRef = useRef(options.enablement);
  enablementRef.current = options.enablement;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return keymap().bindHold(
      commandId,
      (held) => onChangeRef.current(held),
      () => enablementRef.current?.() ?? true,
    );
  }, [commandId, active]);
};

/**
 * Pushes a dismisser while mounted; Escape pops exactly one (§4.6). The scope
 * is what orders the stack — see `DismissalStack.snapshot()`.
 */
export const useDismissable = (
  id: string,
  label: string,
  scope: ScopeId,
  dismiss: () => boolean,
  active = true,
): void => {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return keymap().dismissal.push({
      id,
      label,
      scope,
      dismiss: () => dismissRef.current(),
    });
  }, [id, label, scope, active]);
};

/** The live dismissal stack, innermost first. */
export const useDismissalStack = (): readonly Dismisser[] => {
  const [tick, setTick] = useState(0);
  useEffect(
    () => keymap().dismissal.subscribe(() => setTick((current) => current + 1)),
    [],
  );
  return useMemo(
    () => keymap().dismissal.snapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
};

export interface KeymapView {
  bindings: readonly ResolvedBinding[];
  overlaps: OverlapMap;
  activeScopes: ReadonlySet<ScopeId>;
  preset: string;
  isBound: (commandId: string) => boolean;
  isReachable: (scope: ScopeId) => boolean;
}

/** Everything the settings pane renders from. */
export const useKeymapView = (): KeymapView => {
  const version = useKeymapVersion();
  return useMemo(() => {
    const registry = keymap();
    const bindings = registry.resolved();
    return {
      bindings,
      overlaps: analyzeOverlaps(bindings),
      activeScopes: registry.activeScopes(),
      preset: registry.getPreset(),
      isBound: (commandId: string) => registry.isBound(commandId),
      isReachable: (scope: ScopeId) => registry.isReachable(scope),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
};

/**
 * The keys currently resolved for one command. Use this anywhere a shortcut is
 * displayed — tooltips, help panels, inline prose — so there is exactly one
 * source of truth and no string to drift (F5, F6).
 */
export const useCommandKeys = (commandId: string): readonly string[] => {
  const view = useKeymapView();
  return useMemo(
    () =>
      view.bindings.find((binding) => binding.entry.id === commandId)?.keys ??
      [],
    [view, commandId],
  );
};

/** Mutations, all of which persist only the override layer. */
export const useKeymapActions = () =>
  useMemo(
    () => ({
      setKeys: (commandId: string, keys: readonly string[]) =>
        keymap().setKeys(commandId, keys),
      disable: (commandId: string) => keymap().setKeys(commandId, []),
      restore: (commandId: string) => keymap().restore(commandId),
      restoreAll: () => keymap().restoreAll(),
      setPreset: (preset: string) => keymap().setPreset(preset),
      setOverrides: (overrides: Record<string, string[]>) =>
        keymap().setOverrides(overrides),
    }),
    [],
  );

/** Re-renders when the real keyboard layout arrives, so labels upgrade in place. */
export const useKeyboardLayout = (): void => {
  const [, setTick] = useState(0);
  useEffect(() => {
    ensureKeyboardLayout();
    return subscribeToKeyboardLayout(() => setTick((tick) => tick + 1));
  }, []);
};

export interface ChordRecorder {
  /** The command currently being rebound, if any. */
  target: string | null;
  /** Last chord captured, pending commit. */
  captured: Chord | null;
  start: (commandId: string) => void;
  cancel: () => void;
}

/**
 * Captures the next chord for a rebind.
 *
 * The listener goes on `window` in the capture phase, which runs strictly
 * before the registry's `document` capture listener — so while recording, the
 * recorder sees the keystroke first and `stopPropagation()` genuinely prevents
 * the chord being *executed* as you assign it. This is the same ordering
 * property §4.1 relies on, used here for the opposite purpose.
 *
 * Arming this is a *modal* state that swallows every keystroke in the app, so
 * it must be impossible to leave armed by accident. Anything that means "I'm
 * doing something else now" cancels it: a pointer press anywhere, the window
 * losing focus, or the owning component unmounting. Without that, one stray
 * click on a rebind button silently eats the user's next keypress and writes it
 * into the keymap — a persisted, invisible, thoroughly confusing breakage.
 */
export const useChordRecorder = (
  onCapture: (commandId: string, chord: Chord) => void,
): ChordRecorder => {
  const [target, setTarget] = useState<string | null>(null);
  const [captured, setCaptured] = useState<Chord | null>(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useEffect(() => {
    if (!target) {
      return undefined;
    }

    const disarm = () => {
      setTarget(null);
      setCaptured(null);
    };

    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Escape aborts rather than being assignable; it is non-remappable
      // anyway, and this is the conventional escape hatch out of a recorder.
      if (event.code === "Escape") {
        disarm();
        return;
      }
      // Wait for a real key — a bare modifier press is the user still reaching.
      if (isModifierCode(event.code)) {
        setCaptured(chordFromEvent(event));
        return;
      }
      const chord = chordFromEvent(event);
      setCaptured(chord);
      onCaptureRef.current(target, chord);
      setTarget(null);
    };

    // Capture-phase pointerdown so clicking *anything* — including the button
    // that armed it — disarms before that click is handled as something else.
    window.addEventListener("keydown", listener, { capture: true });
    window.addEventListener("pointerdown", disarm, { capture: true });
    window.addEventListener("blur", disarm);
    return () => {
      window.removeEventListener("keydown", listener, { capture: true });
      window.removeEventListener("pointerdown", disarm, { capture: true });
      window.removeEventListener("blur", disarm);
      // Unmounting (closing the modal, switching section) must not leave a
      // dangling armed state behind.
    };
  }, [target]);

  const start = useCallback((commandId: string) => {
    setCaptured(null);
    setTarget(commandId);
  }, []);

  const cancel = useCallback(() => {
    setTarget(null);
    setCaptured(null);
  }, []);

  return { target, captured, start, cancel };
};

/** The last matched chord and its full ranking, for the demo readout. */
export const useLastResolution = (): {
  chord: string;
  candidates: Candidate[];
} | null => {
  const version = useKeymapVersion();
  return useMemo(
    () => keymap().lastResolution(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
};

export { formatChord };
