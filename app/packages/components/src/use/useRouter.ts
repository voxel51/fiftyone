import {
  getEventSource,
  getFetchFunction,
  setFetchFunction,
  GraphQLError,
} from "@fiftyone/utilities";
import {
  Environment,
  FetchFunction,
  GraphQLResponse,
  Network,
  Observable,
  RecordSource,
  Store,
  SubscribeFunction,
} from "relay-runtime";
import React, { useMemo, useRef, useState } from "react";

import { RouteDefinition, createRouter, Router } from "../routing";
import { GQLError } from "@fiftyone/utilities/src/errors";

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object
): Promise<GraphQLResponse> {
  const data = await getFetchFunction()<unknown, GraphQLResponse>(
    "POST",
    "/graphql",
    {
      query: text,
      variables,
    }
  );

  if ("errors" in data && data.errors) {
    throw new GraphQLError((data.errors as unknown) as GQLError[]);
  }
  return data;
}

const fetchRelay: FetchFunction = async (params, variables) => {
  return fetchGraphQL(params.text, variables);
};

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const subscribeRelay: SubscribeFunction = (params, variables) => {
  return Observable.create((sink) => {
    const controller = new AbortController();

    const unsubscribe = () => {
      controller.abort();
    };

    const dispose = {
      unsubscribe,
      closed: false,
    };

    controller.signal.addEventListener("abort", () => {
      dispose.closed = true;
    });

    getEventSource(
      "/graphql",
      {
        onmessage: (message) => {
          const data = JSON.parse(message.data);
          sink.next(data);
        },
      },
      controller.signal,
      {
        id: generateUUID(),
        type: "subscribe",
        payload: {
          params,
          variables,
        },
      }
    );

    return dispose;
  });
};

export const getEnvironment = () =>
  new Environment({
    network: Network.create(fetchRelay),
    store: new Store(new RecordSource()),
  });

const useRouter = (
  makeRoutes: (environment: Environment) => RouteDefinition[],
  deps?: React.DependencyList | undefined
) => {
  const [environment] = useState(getEnvironment);
  const router = useRef<Router<any>>();

  router.current = useMemo(() => {
    router.current && router.current.cleanup();

    return createRouter(environment, makeRoutes(environment));
  }, [environment, ...(deps || [])]);

  return { context: router.current.context, environment };
};

export default useRouter;
