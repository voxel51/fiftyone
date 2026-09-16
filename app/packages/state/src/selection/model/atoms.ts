import { atom, type SetStateAction } from "jotai";
import { atomFamily } from "jotai-family";
import { isPersistentDomain } from "../model";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionCounts,
} from "../types";

export interface CandidateState {
  readonly key: string;
  /** Exact counts for the whole scope, or null while resolving. */
  readonly counts: SelectionCounts | null;
  readonly unavailableGroups?: readonly EpisodeSelection[];
  /** Details for captured parents; null marks one outside the scope. */
  readonly candidates: ReadonlyMap<string, EpisodeSelection | null>;
  readonly error: string | null;
  readonly loading: boolean;
}

export const candidatesAtom = atomFamily((_datasetId: string) =>
  atom<CandidateState>({
    key: "",
    counts: null,
    candidates: new Map(),
    loading: true,
    error: null,
  }),
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

/** Domain-isolated captures; the samples view mirrors them to session storage. */
export const selectionAtom = atomFamily((datasetId: string) => {
  const persistent = isPersistentDomain(datasetId);
  const base = atom<Captures>(persistent ? readCaptures(datasetId) : new Map());
  return atom(
    (get) => get(base),
    (get, set, update: SetStateAction<Captures>) => {
      const next = typeof update === "function" ? update(get(base)) : update;
      set(base, next);
      if (persistent) writeCaptures(datasetId, next);
    },
  );
});
export const boundaryAtom = atomFamily((_datasetId: string) =>
  atom<SelectionBoundary>({}),
);
export const scopeRevisionAtom = atomFamily((_datasetId: string) => atom(0));
/** How many extra captures each end of a folded strip has revealed. */
export const foldRevealedAtom = atomFamily((_datasetId: string) => atom(0));
