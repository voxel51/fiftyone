import { atom } from "jotai";

export type SettingsSection =
  | "appearance"
  | "hotkeys"
  | "notifications"
  | "security";

export const settingsOpenAtom = atom(false);
export const settingsSectionAtom = atom<SettingsSection>("hotkeys");
