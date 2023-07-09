import { GQLError, GraphQLError, getFetchFunction } from "@fiftyone/utilities";
import {
  Environment,
  GraphQLResponse,
  Network,
  Observable,
  RecordSource,
  Store,
} from "relay-runtime";
import { Sink } from "relay-runtime/lib/network/RelayObservable";
import { v4 } from "uuid";

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object,
  params?: string
): Promise<GraphQLResponse> {
  const data = await getFetchFunction()<unknown, GraphQLResponse>(
    "POST",
    `/graphql${params?.length ? `?${params}` : ""}`,
    {
      query: text,
      variables,
    }
  );

  if ("errors" in data && data.errors) {
    console.error(data);
    throw new GraphQLError({
      errors: data.errors as GQLError[],
      variables,
    });
  }
  return data;
}

const fetchRelay = async (params, variables) => {
  return fetchGraphQL(params.text, variables);
};

export const createEnvironment = () => {
  const subscription = v4();

  const operations = new Map<string, Sink<GraphQLResponse>>();

  const poll = () => {
    getFetchFunction()(
      "GET",
      `/graphql?subscription=${subscription}`,
      undefined,
      "json",
      0
    ).then((a) => {
      a.data.messages.forEach((m) => {
        if (m.type === "next") {
          operations.get(m.id)!.next(m.payload);
        }
        console.log(m);
      });
      setTimeout(poll, 5000);
    });
  };
  poll();

  return new Environment({
    network: Network.create(fetchRelay, (operation, variables) => {
      return Observable.create((sink) => {
        const operationId = v4();
        operations.set(operationId, sink);
        fetchGraphQL(
          operation.text,
          variables,
          new URLSearchParams({
            operation: operationId,
            subscription,
          }).toString()
        ).then((...all) => {
          console.log(all);
        });
      });
    }),
    store: new Store(new RecordSource()),
  });
};
