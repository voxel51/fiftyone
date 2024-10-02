import { useLazyLoadQuery } from "react-relay";
import {
  CacheConfig,
  FetchPolicy,
  GraphQLTaggedNode,
  OperationType,
  RenderPolicy,
  VariablesOf,
} from "relay-runtime";
import { useCacheStore } from "@fiftyone/hooks";
import { useEffect } from "react";

export default function useLazyLoadLatestQuery<TQuery extends OperationType>(
  gqlQuery: GraphQLTaggedNode,
  variables: VariablesOf<TQuery>,
  options?: {
    fetchKey?: string | number | undefined;
    fetchPolicy?: FetchPolicy | undefined;
    networkCacheConfig?: CacheConfig | undefined;
    UNSTABLE_renderPolicy?: RenderPolicy | undefined;
    cacheKey?: string;
  }
): TQuery["response"] {
  const [stale, setStale] = useCacheStore(options.cacheKey || "");
  const computedOptions = options || {};

  if (stale) computedOptions.fetchPolicy = "network-only";
  const data = useLazyLoadQuery(gqlQuery, variables, computedOptions);

  useEffect(() => {
    setStale(false);
  }, [data]);

  return data;
}
