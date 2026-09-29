/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { GetReverbValue, ReverbState } from "@fiftyone/reverb";
import type { GraphQLTaggedNode, Variables } from "relay-runtime";
import type { QueryResponse } from "./graphQLQuerySource";
import {
  type GraphQLEnvironmentOption,
  type MapResponseCallbacks,
  graphQLSelectorFamily,
} from "./graphQLSelectorFamily";

export interface GraphQLSelectorOptions<TVariables, T, TData> {
  /** Used when `variables` resolves to null, which skips the query. */
  default?: T;
  environment: GraphQLEnvironmentOption;
  key: string;
  mapResponse: (data: TData, callbacks: MapResponseCallbacks<TVariables>) => T;
  query: GraphQLTaggedNode;
  variables:
    | TVariables
    | ((accessors: { get: GetReverbValue }) => TVariables | null);
}

/** The single-member form of {@link graphQLSelectorFamily}. */
export function graphQLSelector<
  TVariables extends Variables,
  T,
  TData extends object = QueryResponse,
>(options: GraphQLSelectorOptions<TVariables, T, TData>): ReverbState<T> {
  return graphQLSelectorFamily<TVariables, undefined, T, TData>({
    ...options,
    variables: () => options.variables,
  })(undefined);
}
