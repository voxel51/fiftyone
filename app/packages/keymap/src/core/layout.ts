/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Chord } from "./chords";
import { tryParseChord } from "./chords";

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

export const subscribeToKeyboardLayout = (
  listener: () => void,
): (() => void) => {
  layoutListeners.add(listener);
  return () => {
    layoutListeners.delete(listener);
  };
};

/** True when labels come from the real layout rather than the QWERTY guess. */
export const hasKeyboardLayout = (): boolean => layoutMap !== null;

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string };
}

/**
 * `navigator.platform` is deprecated and, on iPadOS, actively lies — it reports
 * "MacIntel". `userAgentData.platform` is the supported replacement but is
 * Chromium-only, and it reports "macOS" for iPads too, so both paths need the
 * touch check. Worst case we get the modifier glyphs wrong on an unusual
 * browser, which is a label bug rather than a binding one.
 */
const isApple = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const uaPlatform = (navigator as NavigatorWithUAData).userAgentData?.platform;
  if (uaPlatform) {
    return /mac|ios|iphone|ipad/i.test(uaPlatform);
  }

  // Legacy fallback for Firefox and Safari, which have no `userAgentData`.
  const legacy: string = navigator.platform ?? navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(legacy);
};

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

/**
 * Human-readable chord, e.g. `⌃⇧⌘S` on Apple, `Ctrl + Shift + S` elsewhere.
 *
 * Modifier order follows each platform's own convention rather than the storage
 * order in `formatChord`: Apple writes control-option-shift-command, Windows and
 * Linux put the meta key first and shift last. Getting this wrong is
 * immediately noticeable to users ("Shift + Win + Z" reads as a typo).
 */
export const describeChord = (chord: Chord): string => {
  const apple = isApple();
  const parts: string[] = [];

  if (apple) {
    if (chord.ctrl) {
      parts.push("⌃");
    }
    if (chord.alt) {
      parts.push("⌥");
    }
    if (chord.shift) {
      parts.push("⇧");
    }
    if (chord.meta) {
      parts.push("⌘");
    }
  } else {
    if (chord.ctrl) {
      parts.push("Ctrl");
    }
    if (chord.meta) {
      parts.push("Win");
    }
    if (chord.alt) {
      parts.push("Alt");
    }
    if (chord.shift) {
      parts.push("Shift");
    }
  }

  parts.push(describeCode(chord.code));
  return parts.join(apple ? " " : " + ");
};

/**
 * Label for a command's resolved key list. Any UI that shows a shortcut must
 * go through this rather than hardcoding a glyph beside the binding — that
 * habit is precisely what produced the three drifting shortcut tables and the
 * `shortcut: "p"` that is never actually bound (design doc F5, F6).
 *
 * Returns "unbound" for an empty list, so a rebound or disabled command reads
 * as missing instead of silently rendering nothing.
 */
export const describeKeys = (keys: readonly string[]): string => {
  if (keys.length === 0) {
    return "unbound";
  }
  return keys
    .map((key) => {
      const chord = tryParseChord(key);
      return chord ? describeChord(chord) : key;
    })
    .join(" or ");
};
