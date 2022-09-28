import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import useSendEvent from "./useSendEvent";

import * as foq from "@fiftyone/relay";
import { stateSubscription } from "../recoil";
import { useErrorHandler } from "react-error-boundary";

const useSetSelected = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setSelectedMutation>(foq.setSelected);
  const onError = useErrorHandler();

  return (selected: string[]) =>
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, selected },
      })
    );
};

export default useSetSelected;
