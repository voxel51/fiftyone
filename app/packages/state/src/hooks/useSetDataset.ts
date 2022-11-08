import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { stateSubscription } from "../recoil";
import useSendEvent from "./useSendEvent";
import useTo from "./useTo";

const useSetDataset = () => {
  const { to } = useTo({
    state: {
      selected: [],
      selectedLabels: [],
      view: [],
      viewCls: null,
      viewName: null,
    },
    variables: { view: [] },
  });
  const send = useSendEvent();
  const [commit] = useMutation<foq.setDatasetMutation>(foq.setDataset);
  const subscription = useRecoilValue(stateSubscription);
  const onError = useErrorHandler();

  return (name?: string) => {
    to(name ? `/datasets/${encodeURI(name)}` : "/");

    send((session) =>
      commit({
        onError,
        variables: { subscription, session, name },
      })
    );
  };
};

export default useSetDataset;
