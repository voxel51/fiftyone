import { usePendingRuns } from "@fiftyone/operators";

const PENDING_RUNS = {
  operators: [
    "@voxel51/brain/compute_similarity",
    "@voxel51/operators/compute_similarity",
  ],
};

export default function usePendingSimilarityRuns(brainKeys: { key: string }[]) {
  const { runs, loaded } = usePendingRuns(PENDING_RUNS, brainKeys);
  return {
    runs: runs.filter(
      (pending) => !brainKeys.some((bk) => bk.key === pending.brain_key),
    ),
    loaded,
  };
}
