import { usePendingRuns, type PendingRun } from "@fiftyone/operators";

const PENDING_RUNS = {
  operators: [
    "@voxel51/brain/compute_similarity",
    "@voxel51/operators/compute_similarity",
  ],
};

export default function usePendingSimilarityRuns(
  brainKeys: { key: string }[],
  unreadyKeys: string[] = [],
) {
  const { runs, loaded } = usePendingRuns(PENDING_RUNS, brainKeys);
  const delegated = runs.filter(
    (pending) => !brainKeys.some((bk) => bk.key === pending.brain_key),
  );
  const inProgress: PendingRun[] = unreadyKeys
    .filter((key) => !delegated.some((pending) => pending.brain_key === key))
    .map((key) => ({
      id: `registered:${key}`,
      operator: "",
      run_state: "in_progress",
      label: null,
      brain_key: key,
    }));

  return { runs: [...delegated, ...inProgress], loaded };
}
