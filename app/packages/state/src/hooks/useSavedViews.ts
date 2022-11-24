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

  return {
    savedViews,
    isDeletingSavedView,
    refresh,
    handleDeleteView,
  };
}
