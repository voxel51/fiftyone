import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";

export default function useSavedViews() {
  const datasetNameValue = useRecoilValue(fos.datasetName);
  const onError = useErrorHandler();
  const subscription = useRecoilValue(fos.stateSubscription);

  const [deleteView, isDeletingSavedView] =
    useMutation<foq.deleteSavedViewMutation>(foq.deleteSavedView);
  const [saveView, isCreatingSavedView] =
    useMutation<foq.createSavedViewMutation>(foq.createSavedView);
  const [updateView, isUpdatingSavedView] =
    useMutation<foq.updateSavedViewMutation>(foq.updateSavedView);

  const handleDeleteView = useCallback(
    (
      nameValue: string,
      onDeleteSuccess: (deletedId: string | null) => void
    ) => {
      if (nameValue) {
        deleteView({
          onError,
          variables: {
            viewName: nameValue,
            datasetName: datasetNameValue,
            subscription,
          },
          onCompleted: (data, err) => {
            if (err) {
              console.error("handleDeleteView error:", err);
            }
            const deletedId = data?.deleteSavedView;
            onDeleteSuccess(deletedId);
          },
        });
      }
    },
    [datasetNameValue, deleteView, onError, subscription]
  );

  const handleCreateSavedView = useRecoilCallback(
    ({ snapshot }) =>
      async (
        name: string,
        description: string,
        color: string,
        view: fos.State.Stage[],
        onSuccess: (
          savedView: foq.createSavedViewMutation$data["createSavedView"]
        ) => void
      ) => {
        if (name) {
          saveView({
            onError,
            variables: {
              viewName: name,
              datasetName: datasetNameValue,
              viewStages: view,
              form: {
                filters: await snapshot.getPromise(fos.filters),
                sampleIds: Array.from(
                  await snapshot.getPromise(fos.selectedSamples)
                ),
                slice: await snapshot.getPromise(fos.groupSlice),
                extended: await snapshot.getPromise(fos.extendedStages),
              },
              description,
              color,
              subscription,
            },
            onCompleted: (data, err) => {
              if (err) {
                console.error("handleCreateSavedView response error:", err);
              }
              onSuccess(data?.createSavedView);
            },
          });
        }
      },
    [datasetNameValue, saveView, onError, subscription]
  );

  const handleUpdateSavedView = useCallback(
    (
      initialName: string,
      name: string,
      description: string,
      color: string,
      onSuccess: (
        savedView: foq.updateSavedViewMutation$data["updateSavedView"]
      ) => void
    ) => {
      if (initialName) {
        updateView({
          onError,
          variables: {
            subscription,
            datasetName: datasetNameValue,
            viewName: initialName,
            updatedInfo: {
              name,
              color,
              description,
            },
          },
          onCompleted: ({ updateSavedView }) => {
            onSuccess(updateSavedView);
          },
        });
      }
    },
    [datasetNameValue, updateView, onError, subscription]
  );

  return {
    isDeletingSavedView,
    handleDeleteView,
    isCreatingSavedView,
    handleCreateSavedView,
    handleUpdateSavedView,
    isUpdatingSavedView,
  };
}
