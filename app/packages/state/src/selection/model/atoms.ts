import { atom } from "jotai";
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

export const selectionAtom = atomFamily((_datasetId: string) =>
  atom<ReadonlyMap<string, EpisodeSelection>>(new Map()),
);
export const boundaryAtom = atomFamily((_datasetId: string) =>
  atom<SelectionBoundary>({}),
);
export const scopeRevisionAtom = atomFamily((_datasetId: string) => atom(0));
