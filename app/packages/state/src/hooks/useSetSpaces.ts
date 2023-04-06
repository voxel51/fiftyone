import * as foq from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { stateSubscription } from "../recoil";
import useSendEvent from "./useSendEvent";

const useSetSpaces = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const [commit] = useMutation<foq.setSpacesMutation>(foq.setSpaces);
  const onError = useErrorHandler();

  return (spaces: object) =>
    send((session) =>
      commit({
        onError,
        variables: { subscription, session, spaces },
      })
    );
};

export default useSetSpaces;
