import * as foq from "@fiftyone/relay";
import { EventsContext, stateSubscription } from "@fiftyone/state";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";

import useTo from "./useTo";

const useSetDataset = () => {
  const { to } = useTo();
  const { session } = useContext(EventsContext);
  const [commit] = useMutation<foq.setDatasetMutation>(foq.setDataset);
  const subscription = useRecoilValue(stateSubscription);
  const onError = useErrorHandler();
  return (name?: string) => {
    commit({
      onError,
      variables: { subscription, session, name },
    });
    to(name ? `/datasets/${encodeURIComponent(name)}` : "/");
  };
};

export default useSetDataset;
