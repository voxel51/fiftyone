import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { stateSubscription } from "../recoil";
import useSendEvent from "./useSendEvent";
import useTo from "./useTo";
import { getSavedViewName } from "../utils";
import { RouterContext } from "../routing";
import { useContext } from "react";

const useSetDataset = () => {
  const { to } = useTo({
    state: {
      selected: [],
      selectedLabels: [],
      view: [],
      viewCls: null,
      viewName: null,
    },
    variables: { view: [], viewName: null },
  });
  const send = useSendEvent();
  const [commit] = useMutation<foq.setDatasetMutation>(foq.setDataset);
  const subscription = useRecoilValue(stateSubscription);
  const onError = useErrorHandler();
  const router = useContext(RouterContext);
  const viewName = getSavedViewName(router);
  return (name?: string) => {
    to(name ? `/datasets/${encodeURIComponent(name)}` : "/");

    send((session) =>
      commit({
        onError,
        variables: { subscription, session, name, viewName },
      })
    );
  };
};

export default useSetDataset;
