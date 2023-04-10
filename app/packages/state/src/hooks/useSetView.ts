import { setView, setViewMutation } from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useSetRecoilState } from "recoil";
import {
  datasetName,
  State,
  stateSubscription,
  view,
  viewStateForm,
} from "../recoil";
import useSendEvent from "./useSendEvent";

const useSetView = () => {
  return useSetRecoilState(view);
  const send = useSendEvent(true);
  const [commit] = useMutation<setViewMutation>(setView);
  const onError = useErrorHandler();

  return useRecoilCallback(
    ({ snapshot }) =>
      (
        viewOrUpdater:
          | State.Stage[]
          | ((current: State.Stage[]) => State.Stage[]),
        addStages?: State.Stage[],
        savedViewSlug?: string,
        omitSelected?: boolean
      ) => {
        send((session) => {
          const value =
            viewOrUpdater instanceof Function
              ? viewOrUpdater(snapshot.getLoadable(view).contents)
              : viewOrUpdater;

          const dataset = snapshot.getLoadable(datasetName).contents;
          const subscription = snapshot.getLoadable(stateSubscription).contents;
          commit({
            variables: {
              subscription,
              session,
              view: value,
              datasetName: dataset,
              form: patch
                ? snapshot.getLoadable(
                    viewStateForm({
                      addStages: addStages
                        ? JSON.stringify(addStages)
                        : undefined,
                      modal: false,
                      selectSlice,
                      omitSelected,
                    })
                  ).contents
                : {},
              savedViewSlug,
            },
            onError,
            onCompleted: () => {
              onComplete && onComplete();
            },
          });
        });
      },
    [patch, selectSlice, onComplete]
  );
};

export default useSetView;
