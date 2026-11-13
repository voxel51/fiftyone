import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";

/**
 * Per-call options for the saved view mutations. ``onError`` receives a
 * failed request or a GraphQL error; without it, errors go to the page's
 * error boundary as before.
 */
export interface SavedViewMutationOptions {
  onError?: (error: Error) => void;
}

export interface CreateSavedViewOptions extends SavedViewMutationOptions {
  /**
   * The sample IDs to save as a ``Select`` stage. Defaults to the current
   * sample selection; pass an empty list to save the view without it.
   */
  sampleIds?: string[];
}

function firstError(errors: readonly { message: string }[] | null | undefined) {
  return errors?.length ? new Error(errors[0].message) : null;
}

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
      onDeleteSuccess: (deletedId: string | null) => void,
      options: SavedViewMutationOptions = {},
    ) => {
      if (nameValue) {
        deleteView({
          onError: options.onError ?? onError,
          variables: {
            viewName: nameValue,
            datasetName: datasetNameValue,
            subscription,
          },
          onCompleted: (data, err) => {
            const error = firstError(err);
            if (error && options.onError) {
              options.onError(error);
              return;
            }
            if (err) {
              console.error("handleDeleteView error:", err);
            }
            const deletedId = data?.deleteSavedView;
            onDeleteSuccess(deletedId);
          },
        });
      }
    },
    [datasetNameValue, deleteView, onError, subscription],
  );

  const handleCreateSavedView = useRecoilCallback(
    ({ snapshot }) =>
      async (
        name: string,
        description: string,
        color: string,
        view: fos.State.Stage[],
        onSuccess: (
          savedView: foq.createSavedViewMutation$data["createSavedView"],
        ) => void,
        options: CreateSavedViewOptions = {},
      ) => {
        if (name) {
          saveView({
            onError: options.onError ?? onError,
            variables: {
              viewName: name,
              datasetName: datasetNameValue,
              viewStages: view,
              form: {
                filters: await snapshot.getPromise(fos.filters),
                sampleIds:
                  options.sampleIds ??
                  Array.from(
                    (await snapshot.getPromise(fos.selectedSamples)).keys(),
                  ),
                slice: await snapshot.getPromise(fos.groupSlice),
                extended: await snapshot.getPromise(fos.extendedStages),
              },
              description,
              color,
              subscription,
            },
            onCompleted: (data, err) => {
              const error = firstError(err);
              if (error && options.onError) {
                options.onError(error);
                return;
              }
              if (err) {
                console.error("handleCreateSavedView response error:", err);
              }
              onSuccess(data?.createSavedView);
            },
          });
        }
      },
    [datasetNameValue, saveView, onError, subscription],
  );

  const handleUpdateSavedView = useCallback(
    (
      initialName: string,
      name: string,
      description: string | null,
      color: string | null,
      onSuccess: (
        savedView: foq.updateSavedViewMutation$data["updateSavedView"],
      ) => void,
      options: SavedViewMutationOptions = {},
    ) => {
      if (initialName) {
        updateView({
          onError: options.onError ?? onError,
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
          onCompleted: (data, err) => {
            const error = firstError(err);
            if (error && options.onError) {
              options.onError(error);
              return;
            }
            onSuccess(data?.updateSavedView);
          },
        });
      }
    },
    [datasetNameValue, updateView, onError, subscription],
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
