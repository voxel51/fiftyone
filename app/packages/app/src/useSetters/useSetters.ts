import { Setter } from "@fiftyone/relay";
import { Session, gqlNotiErrorsAtom } from "@fiftyone/state";
import { MutableRefObject, useMemo } from "react";
import { Environment } from "react-relay";
import { Queries } from "../makeRoutes";
import { RoutingContext } from "../routing";
import { REGISTERED_SETTERS } from "./registerSetter";
import { useRecoilCallback } from "recoil";

const useSetters = (
  environment: Environment,
  router: RoutingContext<Queries>,
  sessionRef: MutableRefObject<Session>
) => {
  const handleError = useRecoilCallback(
    ({ set: setRecoil }) =>
      async (errors: string[] = []) => {
        setRecoil(gqlNotiErrorsAtom, errors);
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
