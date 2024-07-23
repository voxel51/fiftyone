import type { Setter } from "@fiftyone/relay";
import {
  type Session,
  snackbarErrors,
  stateSubscription,
  useSessionSetter,
} from "@fiftyone/state";
import { type MutableRefObject, useMemo } from "react";
import type { Environment } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { pendingEntry } from "../Renderer";
import type { Queries } from "../makeRoutes";
import type { RoutingContext } from "../routing";
import { REGISTERED_SETTERS } from "./registerSetter";

const useSetters = (
  environment: Environment,
  router: RoutingContext<Queries>,
  sessionRef: MutableRefObject<Session>
) => {
  const handleError = useRecoilCallback(
    ({ set: setRecoil }) =>
      async (errors: string[] = []) => {
        setRecoil(snackbarErrors, errors);
        setRecoil(pendingEntry, false);
      },
    []
  );
  const subscription = useRecoilValue(stateSubscription);
  const setter = useSessionSetter();

  return useMemo(() => {
    const setters = new Map<string, Setter>();
    const ctx = {
      environment,
      handleError,
      router,
      sessionRef,
      setter,
      subscription,
    };
    REGISTERED_SETTERS.forEach((value, key) => {
      setters.set(key, value(ctx));
    });

    return setters;
  }, [environment, handleError, router, sessionRef, setter, subscription]);
};

export default useSetters;
