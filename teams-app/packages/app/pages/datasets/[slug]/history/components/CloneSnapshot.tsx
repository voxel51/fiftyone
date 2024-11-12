import { useCreateDataset, useMutation } from "@fiftyone/hooks";
import { DatasetModal } from "@fiftyone/teams-components";
import {
  DatasetCloneMutation,
  DatasetCloneMutationT,
  cloneSnapshotState,
} from "@fiftyone/teams-state";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { useRecoilState } from "recoil";

export default function CloneSnapshot() {
  const { query } = useRouter();
  const { slug } = query;
  const [state, setState] = useRecoilState(cloneSnapshotState);
  const { name, open } = state;
  const [cloneSnapshot, cloningSnapshot] =
    useMutation<DatasetCloneMutationT>(DatasetCloneMutation);
  const { newName } = useCreateDataset();

  const handleClose = useCallback(() => {
    setState((state) => ({ ...state, open: false }));
  }, [setState]);

  return (
    <DatasetModal
      open={open}
      onClose={handleClose}
      visibleFields={{ description: true, tags: true }}
      handleUpdated={() => {
        cloneSnapshot({
          variables: {
            sourceIdentifier: slug as string,
            name: newName,
            snapshot: name,
          },
          successMessage: "Successfully cloned snapshot to a new dataset",
          onSuccess: handleClose,
        });
      }}
      title="Clone snapshot to new dataset"
      actionButtonText="Clone snapshot"
      loading={cloningSnapshot}
    />
  );
}
