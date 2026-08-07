/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Chords are stored as *physical* keys (`KeyboardEvent.code`), per the keymap
 * design doc §4.5. Matching on `code` makes a binding a position on the
 * keyboard rather than a letter, which is what muscle memory actually is, and
 * it is what Blender does. The cost is that `KeyS` is not a label you can show
 * a user, so display goes through `navigator.keyboard.getLayoutMap()` — see
 * `layout.ts`.
 */
export interface Chord {
  /** `KeyboardEvent.code`, e.g. `KeyS`, `BracketLeft`, `Escape`. */
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** Modifier `code` values, which are never a chord's primary key. */
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

export const isModifierCode = (code: string): boolean =>
  MODIFIER_CODES.has(code);

export const makeChord = (
  code: string,
  modifiers: Partial<Omit<Chord, "code">> = {},
): Chord => ({
  code,
  ctrl: modifiers.ctrl ?? false,
  alt: modifiers.alt ?? false,
  shift: modifiers.shift ?? false,
  meta: modifiers.meta ?? false,
});

export const chordFromEvent = (event: KeyboardEvent): Chord => ({
  code: event.code,
  ctrl: event.ctrlKey,
  alt: event.altKey,
  shift: event.shiftKey,
  meta: event.metaKey,
});

/**
 * Canonical serialization: modifiers in a fixed order, then the code, so two
 * chords are the same binding exactly when their strings are equal. This is the
 * form persisted in overrides and used as a map key.
 *
 * The order is ctrl → meta → alt → shift, chosen so the way people naturally
 * write a binding (`ctrl+shift+KeyZ`, `meta+shift+KeyZ`) is already canonical
 * and a hand-authored manifest entry doesn't silently differ from its stored
 * form. Note this is *storage* order and deliberately not display order —
 * `describeChord` uses the platform's convention (`⌃⌥⇧⌘` on Apple) instead.
 */
export const formatChord = (chord: Chord): string => {
  const parts: string[] = [];
  if (chord.ctrl) {
    parts.push("ctrl");
  }
  if (chord.meta) {
    parts.push("meta");
  }
  if (chord.alt) {
    parts.push("alt");
  }
  if (chord.shift) {
    parts.push("shift");
  }
  parts.push(chord.code);
  return parts.join("+");
};

export const parseChord = (serialized: string): Chord => {
  const parts = serialized.split("+").filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new Error(`empty chord: "${serialized}"`);
  }
  const chord = makeChord(parts[parts.length - 1]);
  for (const part of parts.slice(0, -1)) {
    switch (part) {
      case "ctrl":
        chord.ctrl = true;
        break;
      case "alt":
        chord.alt = true;
        break;
      case "shift":
        chord.shift = true;
        break;
      case "meta":
        chord.meta = true;
        break;
      default:
        throw new Error(`unknown modifier "${part}" in chord "${serialized}"`);
    }
  }
  if (isModifierCode(chord.code)) {
    throw new Error(`chord "${serialized}" has no non-modifier key`);
  }
  return chord;
};

/** Safe variant for user-supplied (imported) data. */
export const tryParseChord = (serialized: string): Chord | null => {
  try {
    return parseChord(serialized);
  } catch {
    return null;
  }
};

export const chordsEqual = (a: Chord, b: Chord): boolean =>
  a.code === b.code &&
  a.ctrl === b.ctrl &&
  a.alt === b.alt &&
  a.shift === b.shift &&
  a.meta === b.meta;

/**
 * Modifier matching is exact equality, matching the existing
 * `KeySequence.matches()` semantics — so a binding on `Space` does not fire on
 * `Shift+Space`. Blender's per-modifier `ANY` is deliberately left out of this
 * POC; it belongs in the same place if we want it.
 */
export const chordMatchesEvent = (
  chord: Chord,
  event: KeyboardEvent,
): boolean =>
  chord.code === event.code &&
  chord.ctrl === event.ctrlKey &&
  chord.alt === event.altKey &&
  chord.shift === event.shiftKey &&
  chord.meta === event.metaKey;
