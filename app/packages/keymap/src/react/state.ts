/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "jotai";

/**
 * Settings-modal UI state. Jotai rather than Recoil: none of this touches an
 * existing Recoil system, so there's no reason to add to the pile.
 *
 * Keymap *runtime* state deliberately does not live here. `KeymapRegistry` owns
 * it, because dispatch has to read the resolved keymap synchronously inside a
 * capture-phase listener, and React state is the wrong shape for that. The
 * hooks in `useKeymap.ts` subscribe to the registry instead, so there's exactly
 * one source of truth rather than a store and a mirror that can drift.
 */

export type SettingsSection =
  | "general"
  | "appearance"
  | "display"
  | "shortcuts"
  | "plugins"
  | "notifications"
  | "advanced"
  | "about";

export const settingsOpenAtom = atom(false);

export const settingsSectionAtom = atom<SettingsSection>("general");

/** Search box in the shortcuts pane. */
export const shortcutSearchAtom = atom("");

/** "Only show commands whose scope is currently active." */
export const shortcutActiveOnlyAtom = atom(false);

/** "Only show conflicts and shadowing." */
export const shortcutConflictsOnlyAtom = atom(false);
