import { useMutation } from "react-relay";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import useSendEvent from "./useSendEvent";

import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { groupSlice, stateSubscription, view } from "../recoil";

const useSetGroupSlice = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setGroupSliceMutation>(foq.setGroupSlice);
  const onError = useErrorHandler();

  return useRecoilTransaction_UNSTABLE(({ get, set }) => (slice: string) => {
    set(groupSlice(false), slice);
    send((session) => {
      commit({
        onError,
        variables: { subscription, session, view: get(view), slice },
      });
    });
  });
};

export default useSetGroupSlice;
