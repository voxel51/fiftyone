import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { State, stateSubscription, view } from "../recoil";
import { RouterContext } from "../routing";
import { transformDataset } from "../utils";
import useSendEvent from "./useSendEvent";
import useStateUpdate from "./useStateUpdate";
import * as fos from "../";

const useSetViewByName = () => {
  const send = useSendEvent(true);
  const updateState = useStateUpdate();
  const subscription = useRecoilValue(stateSubscription);
  const router = useContext(RouterContext);
  const [commit] = useMutation<setViewMutation>(setView);

  const onError = useErrorHandler();

  return useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (
        viewOrUpdater:
          | State.Stage[]
          | ((current: State.Stage[]) => State.Stage[])
      ) => {
        const dataset = get(fos.dataset);
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
              datasetName: dataset.name,
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              console.log("view complete", dataset, value);
              router.history.location.state.state = {
                ...router.history.location.state,
                view: value,
                viewCls: dataset.viewCls,
                selected: [],
                selectedLabels: [],
              };
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

export default useSetViewByName;
