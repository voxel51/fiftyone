/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { formatChord, tryParseChord } from "./chords";
import type { CommandManifestEntry } from "./manifest";
import { MANIFEST, MANIFEST_BY_ID } from "./manifest";

/** command id → serialized chords. An empty array means *disabled*. */
export type OverrideMap = Readonly<Record<string, readonly string[]>>;

export interface KeymapDocument {
  version: 1;
  preset: string;
  overrides: { command: string; keys: string[] }[];
}

export const DEFAULT_PRESET = "fiftyone-default";

/**
 * Presets sit between manifest defaults and user overrides
 * (defaults → preset → user), so a user's own rebinds always win and they keep
 * receiving default-binding improvements for everything they haven't touched.
 * Only overrides are ever persisted, never the resolved map — the mistake many
 * apps make and VS Code's `keybindings.json` avoids.
 */
export const PRESETS: Record<
  string,
  { label: string; overrides: OverrideMap }
> = {
  [DEFAULT_PRESET]: { label: "FiftyOne (default)", overrides: {} },
  "cvat-compatible": {
    label: "CVAT-compatible (sketch)",
    overrides: {
      "fo.modal.annotate.seg.tool.brush": ["KeyW"],
      "fo.modal.annotate.seg.tool.pen": ["KeyZ"],
      "fo.modal.annotate.delete": ["Delete"],
      "fo.modal.next.sample": ["KeyF"],
      "fo.modal.previous.sample": ["KeyD"],
      "fo.modal.sidebar.toggle": ["KeyB"],
    },
  },
};

export interface ResolvedBinding {
  entry: CommandManifestEntry;
  /** Serialized chords actually in force. */
  keys: readonly string[];
  /** Differs from the manifest default. */
  isCustomized: boolean;
  /** Deliberately unbound by the user or preset, despite having a default. */
  isDisabled: boolean;
  /** Which layer supplied `keys`. */
  source: "default" | "preset" | "user";
}

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((key, index) => key === b[index]);

export const resolveBinding = (
  entry: CommandManifestEntry,
  presetName: string,
  userOverrides: OverrideMap,
): ResolvedBinding => {
  const preset = PRESETS[presetName]?.overrides ?? {};

  let keys: readonly string[] = entry.defaultKeys;
  let source: ResolvedBinding["source"] = "default";
  if (entry.id in preset) {
    keys = preset[entry.id];
    source = "preset";
  }
  if (entry.id in userOverrides) {
    keys = userOverrides[entry.id];
    source = "user";
  }

  return {
    entry,
    keys,
    isCustomized: !sameKeys(keys, entry.defaultKeys),
    isDisabled: keys.length === 0 && entry.defaultKeys.length > 0,
    source,
  };
};

export const resolveKeymap = (
  presetName: string,
  userOverrides: OverrideMap,
): ResolvedBinding[] =>
  MANIFEST.map((entry) => resolveBinding(entry, presetName, userOverrides));

// ── Persistence ────────────────────────────────────────────────────────────
// localStorage, the doc's §4.8 "probably fine for v1" tier. The shape follows
// `mcap-modal-settings-storage.ts`: one key, typed payload, validated on read.

const STORAGE_KEY = "fiftyone-keymap-v1";

export const emptyDocument = (): KeymapDocument => ({
  version: 1,
  preset: DEFAULT_PRESET,
  overrides: [],
});

export const toDocument = (
  presetName: string,
  userOverrides: OverrideMap,
): KeymapDocument => ({
  version: 1,
  preset: presetName,
  overrides: Object.entries(userOverrides).map(([command, keys]) => ({
    command,
    keys: [...keys],
  })),
});

/**
 * Validates on read and drops anything it cannot make sense of, so a stale or
 * hand-edited document degrades to defaults for the bad entries rather than
 * breaking the keymap wholesale.
 */
export const fromDocument = (
  raw: unknown,
): { preset: string; overrides: OverrideMap; dropped: string[] } => {
  const dropped: string[] = [];
  const overrides: Record<string, string[]> = {};

  const document = raw as Partial<KeymapDocument> | null;
  if (!document || document.version !== 1) {
    return { preset: DEFAULT_PRESET, overrides: {}, dropped: ["<document>"] };
  }

  const preset =
    typeof document.preset === "string" && document.preset in PRESETS
      ? document.preset
      : DEFAULT_PRESET;

  for (const override of document.overrides ?? []) {
    if (!override || typeof override.command !== "string") {
      continue;
    }
    if (!MANIFEST_BY_ID.has(override.command)) {
      dropped.push(override.command);
      continue;
    }
    const keys = Array.isArray(override.keys) ? override.keys : [];
    const parsed: string[] = [];
    for (const key of keys) {
      const chord = typeof key === "string" ? tryParseChord(key) : null;
      if (chord) {
        parsed.push(formatChord(chord));
      } else {
        dropped.push(`${override.command}:${String(key)}`);
      }
    }
    overrides[override.command] = parsed;
  }

  return { preset, overrides, dropped };
};

export const loadFromStorage = (): {
  preset: string;
  overrides: OverrideMap;
} => {
  if (typeof localStorage === "undefined") {
    return { preset: DEFAULT_PRESET, overrides: {} };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { preset: DEFAULT_PRESET, overrides: {} };
    }
    const { preset, overrides } = fromDocument(JSON.parse(stored));
    return { preset, overrides };
  } catch {
    return { preset: DEFAULT_PRESET, overrides: {} };
  }
};

export const saveToStorage = (
  presetName: string,
  userOverrides: OverrideMap,
): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(toDocument(presetName, userOverrides)),
    );
  } catch {
    // Quota or private-mode: the keymap still works, it just won't persist.
  }
};
