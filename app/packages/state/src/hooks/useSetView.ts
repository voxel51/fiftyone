import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { stateSubscription } from "../recoil";
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

  return (view) => {
    send((session) => {
      commit({
        variables: {
          subscription,
          session,
          view,
          dataset: getDatasetName(context),
        },
        onError,
        onCompleted: ({ setView: { dataset, view } }) => {
          updateState({
            dataset: transformDataset(dataset),
            state: {
              view,
              viewCls: dataset.viewCls,
              selected: [],
              selectedLabels: [],
            },
          });
        },
      });
    });
  };
};

export default useSetView;
