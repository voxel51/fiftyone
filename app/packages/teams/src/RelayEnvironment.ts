import { getFetchFunction } from "@fiftyone/utilities";
import {
  Environment,
  FetchFunction,
  GraphQLResponse,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object
): Promise<GraphQLResponse> {
  try {
    return await getFetchFunction()("POST", "/graphql", {
      query: text,
      variables,
    });
  } catch (error) {
    throw new Error("Failed request");
  }
}

const fetchRelay: FetchFunction = async (params, variables) => {
  return fetchGraphQL(params.text, variables);
};

export default new Environment({
  network: Network.create(fetchRelay),
  store: new Store(new RecordSource()),
});
