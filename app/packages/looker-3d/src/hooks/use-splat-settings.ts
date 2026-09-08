import { atom, useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { SetStateAction } from "react";
import {
  DEFAULT_SPLAT_SETTINGS,
  type Fo3dSplatSettings,
  normalizeSplatSettings,
} from "../fo3d/splat/settings";

const storedSplatSettingsAtom = atomWithStorage<unknown>(
  "fo3d-splatSettings:v1",
  DEFAULT_SPLAT_SETTINGS,
  undefined,
  { getOnInit: true },
);

const splatSettingsAtom = atom(
  (get) => normalizeSplatSettings(get(storedSplatSettingsAtom)),
  (get, set, value: SetStateAction<Fo3dSplatSettings>) => {
    const previous = normalizeSplatSettings(get(storedSplatSettingsAtom));
    const next = typeof value === "function" ? value(previous) : value;
    set(storedSplatSettingsAtom, normalizeSplatSettings(next));
  },
);

/** Returns normalized, browser-persisted Gaussian splat settings. */
export const useSplatSettings = () => useAtom(splatSettingsAtom);
