/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Chord } from "./chords";

/**
 * Since bindings are stored as physical `code`s, the only honest way to label
 * them is to ask the browser what glyph that key produces on the user's actual
 * layout. `navigator.keyboard.getLayoutMap()` does exactly that, but it exists
 * only in Chromium — Firefox and Safari get the static QWERTY table below,
 * which is a wrong *label* for a non-QWERTY user on those browsers, never a
 * wrong binding. That asymmetry is the whole reason the doc recommends physical
 * keys despite the display cost.
 */

/** Fallback glyphs for a US QWERTY layout, plus layout-independent keys. */
const QWERTY_GLYPHS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  Escape: "Esc",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  CapsLock: "Caps",
};

/** Keys whose label never depends on layout, so `getLayoutMap` is not consulted. */
const LAYOUT_INDEPENDENT = new Set([
  "Space",
  "Escape",
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "CapsLock",
]);

type KeyboardLayoutMap = { get(code: string): string | undefined };

let layoutMap: KeyboardLayoutMap | null = null;
let layoutRequested = false;
const layoutListeners = new Set<() => void>();

interface NavigatorWithKeyboard extends Navigator {
  keyboard?: { getLayoutMap(): Promise<KeyboardLayoutMap> };
}

/**
 * Kicks off the async layout lookup once and notifies subscribers when it
 * lands, so labels rendered before it resolves upgrade from the fallback in
 * place rather than being wrong forever.
 */
export const ensureKeyboardLayout = (): void => {
  if (layoutRequested || typeof navigator === "undefined") {
    return;
  }
  layoutRequested = true;
  const keyboard = (navigator as NavigatorWithKeyboard).keyboard;
  if (!keyboard?.getLayoutMap) {
    return;
  }
  keyboard
    .getLayoutMap()
    .then((map) => {
      layoutMap = map;
      for (const listener of layoutListeners) {
        listener();
      }
    })
    .catch(() => {
      // Permissions or an unsupported surface: the fallback table stands.
    });
};

export const subscribeToKeyboardLayout = (listener: () => void): (() => void) => {
  layoutListeners.add(listener);
  return () => {
    layoutListeners.delete(listener);
  };
};

/** True when labels come from the real layout rather than the QWERTY guess. */
export const hasKeyboardLayout = (): boolean => layoutMap !== null;

const isApple = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The glyph for a single physical key, e.g. `KeyS` → `S`, `BracketLeft` → `[`. */
export const describeCode = (code: string): string => {
  if (LAYOUT_INDEPENDENT.has(code)) {
    return QWERTY_GLYPHS[code] ?? code;
  }

  const fromLayout = layoutMap?.get(code);
  if (fromLayout) {
    return fromLayout.length === 1 ? fromLayout.toUpperCase() : fromLayout;
  }

  if (code in QWERTY_GLYPHS) {
    return QWERTY_GLYPHS[code];
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad(.+)$/.test(code)) {
    return `Num ${code.slice(6)}`;
  }
  if (/^F[0-9]{1,2}$/.test(code)) {
    return code;
  }
  return code;
};

/** Human-readable chord, e.g. `⌘ ⇧ S` on Apple, `Ctrl + Shift + S` elsewhere. */
export const describeChord = (chord: Chord): string => {
  const apple = isApple();
  const parts: string[] = [];
  if (chord.ctrl) {
    parts.push(apple ? "⌃" : "Ctrl");
  }
  if (chord.alt) {
    parts.push(apple ? "⌥" : "Alt");
  }
  if (chord.shift) {
    parts.push(apple ? "⇧" : "Shift");
  }
  if (chord.meta) {
    parts.push(apple ? "⌘" : "Win");
  }
  parts.push(describeCode(chord.code));
  return parts.join(apple ? " " : " + ");
};
