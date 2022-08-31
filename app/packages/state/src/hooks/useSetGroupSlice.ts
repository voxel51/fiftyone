import { useMutation } from "react-relay";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import useSendEvent from "./useSendEvent";

import * as foq from "@fiftyone/relay";
import { stateSubscription, view } from "../recoil";
import { useErrorHandler } from "react-error-boundary";

const useSetGroupSlice = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setSelectedMutation>(foq.setSelected);
  const onError = useErrorHandler();

  return useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (slice: string) =>
        send((session) =>
          commit({
            onError,
            variables: { subscription, session, view: get(view), slice },
          })
        )
  );
};

export default useGroupSlice;
