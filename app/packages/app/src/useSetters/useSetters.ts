import { Setter } from "@fiftyone/relay";
import { Session, snackbarErrors } from "@fiftyone/state";
import { MutableRefObject, useMemo } from "react";
import { Environment } from "react-relay";
import { useRecoilCallback } from "recoil";
import { pendingEntry } from "../Renderer";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";
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

  return useMemo(() => {
    const setters = new Map<string, Setter>();
    const ctx = {
      environment,
      handleError,
      router,
      sessionRef,
    };
    REGISTERED_SETTERS.forEach((value, key) => {
      setters.set(key, value(ctx));
    });

    return setters;
  }, [environment, handleError, router, sessionRef]);
};

export default useSetters;
