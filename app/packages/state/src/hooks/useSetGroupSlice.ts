import {
  setGroupSlice,
  setGroupSliceMutation,
  useRelayEnvironment,
} from "@fiftyone/relay";
import { useCallback } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { commitMutation } from "relay-runtime";
import { groupSlice, stateSubscription } from "../recoil";

const useSetGroupSlice = () => {
  const environment = useRelayEnvironment();
  const subscription = useRecoilValue(stateSubscription);
  const setter = useSetRecoilState(groupSlice(false));

  return useCallback(
    (slice: string | null) => {
      commitMutation<setGroupSliceMutation>(environment, {
        mutation: setGroupSlice,
        variables: {
          slice,
          subscription,
        },
      });
      setter(slice);
    },
    [environment, setter, subscription]
  );
};

export default useSetGroupSlice;
