/**
 * The plot's settings, remembered across page loads per (dataset, run).
 *
 * Panel state is Recoil, so it survives view-change remounts and nothing more:
 * a reload dropped every choice back to its default, and the palette, the
 * find-similar limit and the link mode all had to be set again. These are
 * preferences about how to READ a run, not part of its data, so they live in
 * localStorage keyed by the run they were chosen for — a different run, or a
 * different dataset, starts from the defaults rather than inheriting settings
 * picked for someone else's field.
 *
 * Nothing here throws. Storage is unavailable in private windows and over
 * quota, and its contents outlive any build: a setting that cannot be read is
 * a default, never a broken panel. Every value is validated at the point of
 * use (see `isRampId` / `isSimilarLimit`) rather than trusted because it
 * parsed.
 */
import { useMemo } from "react";

const KEY = "fiftyone.embeddings-v2.runSettings.v1";

/** Runs remembered at once. Settings are a few bytes each, but a session
 * sweeping many runs should not grow this without limit. */
const MAX_RUNS = 32;

/** Everything remembered for a run. All optional: a key absent from storage is
 * a setting the user never touched, which is not the same as one they set to
 * its default value — only the second survives a change of default. The open
 * index carries extension-owned settings through the same store (validated at
 * their point of use, like everything here). */
export interface RunSettings {
  rampId?: string;
  [extensionKey: string]: unknown;
}

type Store = Record<string, RunSettings>;

/** Serialized as a tuple so the two identifiers can't collide by splitting a
 * shared separator differently. */
const runKey = (datasetName: string, brainKey: string): string =>
  JSON.stringify([datasetName, brainKey]);

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Arrays excluded explicitly: they are objects, and writing run keys onto
    // one would serialize back as a bare list, silently dropping every setting
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Store)
      : {};
  } catch (e) {
    console.debug("[multimodal-embeddings] could not read stored settings", e);
    return {};
  }
}

/** What was remembered for a run, or nothing. */
export function readRunSettings(
  datasetName: string | null,
  brainKey: string | null,
): RunSettings {
  if (!datasetName || !brainKey) return {};
  const entry = readStore()[runKey(datasetName, brainKey)];
  return entry && typeof entry === "object" ? entry : {};
}

/** Merges one or more settings into a run's stored entry. */
export function writeRunSettings(
  datasetName: string | null,
  brainKey: string | null,
  patch: RunSettings,
): void {
  if (!datasetName || !brainKey) return;
  try {
    const store = readStore();
    const key = runKey(datasetName, brainKey);
    const merged = { ...store[key], ...patch };
    // Deleted before re-inserting: assigning an existing key keeps its original
    // position, so the trim below would evict the run being used right now
    delete store[key];
    store[key] = merged;

    const keys = Object.keys(store);
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_RUNS))) {
      delete store[stale];
    }
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    // A full or blocked store costs the user the memory of this choice, not
    // the choice itself — the setting is already applied in panel state
    console.debug("[multimodal-embeddings] could not store settings", e);
  }
}

/** A run's stored settings, read once per (dataset, run).
 *
 * Read at render rather than seeded through an effect, so the remembered
 * palette is the FIRST one the plot draws with — seeding after mount would
 * paint the default ramp and then rebuild every color to replace it.
 */
export function useStoredRunSettings(
  datasetName: string | null,
  brainKey: string | null,
): RunSettings {
  return useMemo(
    () => readRunSettings(datasetName, brainKey),
    [datasetName, brainKey],
  );
}
