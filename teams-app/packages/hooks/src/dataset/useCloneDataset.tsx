import { useMemo } from "react";
import {
  cloneDatasetState,
  DatasetCloneMutation,
  newDatasetNameState,
} from "@fiftyone/teams-state";
import { useRecoilState, useSetRecoilState } from "recoil";
import { DatasetCloneMutation$data } from "@fiftyone/teams-state/src/Dataset/__generated__/DatasetCloneMutation.graphql";
import { useMutation } from "@fiftyone/hooks";

interface CloneProps {
  newName: string;
  sourceSlug: string;
  cb?: (newSlug: string) => void;
}

export const useCloneDataset = () => {
  const [cloneDataset, cloningDataset] = useMutation(DatasetCloneMutation);

  // set in recoil so subscribers get an update
  const setClonedDataset = useSetRecoilState(cloneDatasetState);
  const [newCloneName, setNewCloneName] =
    useRecoilState<string>(newDatasetNameState);

  return useMemo(() => {
    return {
      cloneDataset: ({ newName, sourceSlug, cb }: CloneProps) => {
        cloneDataset({
          successMessage: `Successfully cloned dataset ${newName}`,
          errorMessage: `Failed to clone dataset ${sourceSlug}.`,
          variables: { name: newName, sourceIdentifier: sourceSlug },
          onCompleted: (clonedDataset: DatasetCloneMutation$data) => {
            const { cloneDataset: theClonedDataset } = clonedDataset;
            setClonedDataset(theClonedDataset);
            cb?.(theClonedDataset?.slug);
          },
          onError: (e) => {
            console.error("failed to update dataset", e);
          },
        });
      },
      cloningDataset,
      setNewCloneName,
      newCloneName,
    };
  }, [newCloneName, cloningDataset]);
};
