import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { State, stateSubscription, view } from "../recoil";
import { RouterContext } from "../routing";
import { getDatasetName, transformDataset } from "../utils";
import useSendEvent from "./useSendEvent";
import useStateUpdate from "./useStateUpdate";

const useSetView = () => {
  const send = useSendEvent(true);
  const context = useContext(RouterContext);
  const updateState = useStateUpdate();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<setViewMutation>(setView);

  const onError = useErrorHandler();

  return useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (
        viewOrUpdater:
          | State.Stage[]
          | ((current: State.Stage[]) => State.Stage[])
      ) => {
        send((session) => {
          const value =
            viewOrUpdater instanceof Function
              ? viewOrUpdater(get(view))
              : viewOrUpdater;
          commit({
            variables: {
              subscription,
              session,
              view: value,
              dataset: getDatasetName(context),
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              updateState({
                dataset: transformDataset(dataset),
                state: {
                  view: value,
                  viewCls: dataset.viewCls,
                  selected: [],
                  selectedLabels: [],
                },
              });
            },
          });
        });
      }
  );
};

export default useSetView;
