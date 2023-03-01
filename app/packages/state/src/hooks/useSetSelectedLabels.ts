import { useErrorHandler } from "react-error-boundary";
import useSendEvent from "./useSendEvent";

import * as foq from "@fiftyone/relay";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { State, stateSubscription } from "../recoil";

const useSetSelectedLabels = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setSelectedLabelsMutation>(
    foq.setSelectedLabels
  );
  const onError = useErrorHandler();

  return (selectedLabels: State.SelectedLabel[]) =>
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, selectedLabels },
      })
    );
};

export default useSetSelectedLabels;
