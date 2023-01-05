import { useCallback } from "react";
import {
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilValue,
} from "recoil";
import { useMutation } from "react-relay";
import { useErrorHandler } from "react-error-boundary";

import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";
import { viewStateForm } from "@fiftyone/state";

export default function useSavedViews() {
  const savedViews = useRecoilValue(fos.savedViewsSelector);
  const datasetNameValue = useRecoilValue(fos.datasetName);
  const refresh = useRecoilRefresher_UNSTABLE(fos.savedViewsSelector);
  const send = fos.useSendEvent();
  const onError = useErrorHandler();
  const subscription = useRecoilValue(fos.stateSubscription);

  const [deleteView, isDeletingSavedView] =
    useMutation<foq.deleteSavedViewMutation>(foq.deleteSavedView);
  const [saveView, isCreatingSavedView] =
    useMutation<foq.createSavedViewMutation>(foq.createSavedView);
  const [updateView, isUpdatingSavedView] =
    useMutation<foq.updateSavedViewMutation>(foq.updateSavedView);

  const handleDeleteView = useCallback(
    (nameValue: string, onDeleteSuccess: (deletedId) => void) => {
      if (nameValue) {
        send((session) =>
          deleteView({
            onError,
            variables: {
              viewName: nameValue,
              datasetName: datasetNameValue,
              subscription,
              session,
            },
            onCompleted: (data, err) => {
              if (err) {
                console.log("handleDeleteView error:", err);
              }
              const deletedId = data?.deleteSavedView;
              onDeleteSuccess(deletedId);
            },
          })
        );
      }
    },
    [datasetNameValue, deleteView, onError, send, subscription]
  );

  const handleCreateSavedView = useRecoilCallback(
    ({ snapshot }) =>
      (
        name: string,
        description: string,
        color: string,
        view: fos.State.Stage[],
        onSuccess: (saveView) => void
      ) => {
        if (name) {
          send((session) =>
            saveView({
              onError,
              variables: {
                viewName: name,
                datasetName: datasetNameValue,
                viewStages: view,
                form: snapshot.getLoadable(viewStateForm({ modal: false }))
                  .contents,
                description,
                color,
                subscription,
                session,
              },
              onCompleted: (data, err) => {
                if (err) {
                  console.log("handleCreateSavedView response error:", err);
                }
                onSuccess(data?.createSavedView);
              },
            })
          );
        }
      },
    [datasetNameValue, saveView, onError, send, subscription]
  );

  const handleUpdateSavedView = useCallback(
    (
      initialName: string,
      name: string,
      description: string,
      color: string,
      onSuccess: (saveView) => void
    ) => {
      if (initialName) {
        send((session) =>
          updateView({
            onError,
            variables: {
              subscription,
              session,
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
          })
        );
      }
    },
    [datasetNameValue, updateView, onError, send, subscription]
  );

  return {
    savedViews,
    refresh,
    isDeletingSavedView,
    handleDeleteView,
    isCreatingSavedView,
    handleCreateSavedView,
    handleUpdateSavedView,
    isUpdatingSavedView,
  };
}
