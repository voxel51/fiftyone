import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";
import type { SavedSubset, SelectionJob, SubsetAddResult } from "../client";

/** Browser progress metadata; captured membership stays on the server. */
export interface SubsetJobRecord {
  readonly trackingId: string;
  readonly subsetId: string;
  readonly subsetName: string;
  readonly subsetView?: SavedSubset["view"];
  readonly preferredGroupSlice?: string | null;
  readonly job: SelectionJob<SubsetAddResult>;
  readonly connectionError?: string;
  readonly unavailable?: boolean;
}

/** Internal per-dataset handles, persisted for reconnecting after reload. */
export const subsetJobsAtom = atomFamily((datasetId: string) =>
  atomWithStorage<readonly SubsetJobRecord[]>(
    `fiftyone:subset-jobs:${datasetId}`,
    [],
    createJSONStorage<readonly SubsetJobRecord[]>(() => sessionStorage),
    { getOnInit: true },
  ),
);
