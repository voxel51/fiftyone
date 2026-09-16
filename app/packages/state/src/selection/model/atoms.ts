import { atom, type SetStateAction } from "jotai";
import { atomFamily } from "jotai-family";
import type { EpisodeSelection, SelectionBoundary } from "../types";

export interface CandidateState {
  readonly unavailableGroups?: readonly EpisodeSelection[];
  readonly key: string;
  readonly groups: readonly EpisodeSelection[];
  readonly error: string | null;
  readonly loading: boolean;
}

export const candidatesAtom = atomFamily((_datasetId: string) =>
  atom<CandidateState>({ key: "", groups: [], loading: true, error: null }),
);

type Captures = ReadonlyMap<string, EpisodeSelection>;

const STORAGE_PREFIX = "fiftyone:grid-selection:";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isGroup(value: unknown): value is EpisodeSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EpisodeSelection).episodeId === "string" &&
    Array.isArray((value as EpisodeSelection).members)
  );
}

/** Captures survive a reload of the same tab; malformed storage is ignored. */
function readCaptures(datasetId: string): Captures {
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + datasetId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(isGroup).map((group) => [group.episodeId, group] as const),
    );
  } catch {
    return new Map();
  }
}

function writeCaptures(datasetId: string, value: Captures) {
  try {
    const key = STORAGE_PREFIX + datasetId;
    if (value.size)
      storage()?.setItem(key, JSON.stringify([...value.values()]));
    else storage()?.removeItem(key);
  } catch {
    /* Storage is a convenience; the in-memory selection is authoritative. */
  }
}

/** Dataset-isolated captures, mirrored to session storage per tab. */
export const selectionAtom = atomFamily((datasetId: string) => {
  const base = atom<Captures>(readCaptures(datasetId));
  return atom(
    (get) => get(base),
    (get, set, update: SetStateAction<Captures>) => {
      const next = typeof update === "function" ? update(get(base)) : update;
      set(base, next);
      writeCaptures(datasetId, next);
    },
  );
});
export const boundaryAtom = atomFamily((_datasetId: string) =>
  atom<SelectionBoundary>({}),
);
export const scopeRevisionAtom = atomFamily((_datasetId: string) => atom(0));
