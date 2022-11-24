import { useCallback } from "react";
import { useRecoilRefresher_UNSTABLE, useRecoilValue } from "recoil";
import { useMutation } from "react-relay";
import { useErrorHandler } from "react-error-boundary";

import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";

export default function useSavedViews() {
  const savedViews = useRecoilValue(fos.savedViewsSelector);
  const refresh = useRecoilRefresher_UNSTABLE(fos.savedViewsSelector);
  const send = fos.useSendEvent();
  const onError = useErrorHandler();
  const subscription = useRecoilValue(fos.stateSubscription);

  const [deleteView, isDeletingSavedView] =
    useMutation<foq.deleteSavedViewMutation>(foq.deleteSavedView);
  const [saveView, isCreatingSavedView] = useMutation<foq.saveViewMutation>(
    foq.saveView
  );
  const [updateView, isUpdatingSavedView] =
    useMutation<foq.updateSavedViewMutation>(foq.updateSavedView);

  const handleDeleteView = useCallback(
    (nameValue: string, onDeleteSuccess: () => void) => {
      if (nameValue) {
        send((session) =>
          deleteView({
            onError,
            variables: {
              viewName: nameValue,
              subscription,
              session,
            },
            onCompleted: () => {
              onDeleteSuccess();
            },
          })
        );
      }
    },
    []
  );

  const handleCreateSavedView = useCallback(
    (
      name: string,
      description: string,
      color: string,
      view: fos.State.Stage[],
      onSuccess: (saveView) => void
    ) => {
      if (name && view.length) {
        send((session) =>
          saveView({
            onError,
            variables: {
              viewName: name,
              description,
              color,
              subscription,
              session,
            },
            onCompleted: ({ saveView }) => {
              onSuccess(saveView);
            },
          })
        );
      }
    },
    []
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
              viewName: initialName,
              subscription,
              session,
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
    []
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
