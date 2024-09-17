import { useCallback, useMemo, useState } from 'react';
import {
  DatasetCreateDatasetMutation,
  nameAvailableState,
  newDatasetDescriptionState,
  newDatasetNameState,
  newDatasetState,
  newDatasetTagsState
} from '@fiftyone/teams-state';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { useMutation } from '@fiftyone/hooks';

/**
 * provides utilities for creating a dataset.
 * @param props
 * @returns
 */
export const useCreateDataset = () => {
  const [createDataset, creatingDataset] = useMutation(
    DatasetCreateDatasetMutation
  );

  const [newName, SetNewName] = useRecoilState(newDatasetNameState);
  const nameAvailable = useRecoilValue(nameAvailableState);
  const [newDescription, SetNewDescription] = useRecoilState(
    newDatasetDescriptionState('')
  );

  // set in recoil so subscribers get an update
  const setNewDataset = useSetRecoilState(newDatasetState);

  const setNewTagsRecoil = useSetRecoilState(newDatasetTagsState([]));

  const reset = useCallback(() => {
    SetNewName('');
    SetNewDescription('');
    setNewTags([]);
    setNewTagsRecoil([]);
  }, []);

  // TODO:MANI not sure why this is not stored similar to name and drscriotion
  // could clean this up
  const [newTags, setNewTags] = useState<string[]>([]);

  const [successMsg, errorMsg] = useMemo(
    () => [
      `Successfully created dataset ${newName}!`,
      `Failed to create dataset ${newName}.`
    ],
    [newName]
  );

  return useMemo(() => {
    return {
      createDataset: ({
        onComplete
      }: {
        onComplete: (newSlug: string) => void;
      }) => {
        createDataset({
          successMessage: successMsg,
          errorMessage: errorMsg,
          variables: {
            name: newName,
            description: newDescription,
            tags: newTags
          },
          onCompleted: (newDataset: { createDataset }) => {
            const finalNewDataset = newDataset?.createDataset;
            setNewDataset(finalNewDataset);
            onComplete(finalNewDataset?.slug);
          },
          onError: (e) => {
            console.error('failed to update dataset', e);
          }
        });
      },
      creatingDataset, // loading state
      newName,
      SetNewName,
      newDescription,
      SetNewDescription,
      newTags,
      setNewTags,
      setNewDataset,
      reset,
      nameAvailable
    };
  }, [
    newName,
    SetNewName,
    newDescription,
    SetNewDescription,
    newTags,
    setNewTags,
    setNewDataset,
    creatingDataset,
    nameAvailable
  ]);
};
