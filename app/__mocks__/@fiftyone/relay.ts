/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SerializableParam } from "@fiftyone/reverb";
import type { Variables } from "relay-runtime";

export * from "@fiftyone/relay";

import { mockValues } from "./reverb";

type Resolved<T, TVariables> = {
  (): T;
  variables: () => TVariables | null;
  key: string;
};

export function graphQLSelector<TVariables extends Variables, T>(options: {
  key: string;
  variables:
    | TVariables
    | ((accessors: { get: (state: { key: string }) => unknown }) => TVariables);
}): Resolved<T, TVariables> {
  function resolver(): T {
    return mockValues[options.key];
  }
  resolver.key = options.key;
  resolver.variables = () =>
    options.variables instanceof Function
      ? options.variables({ get: (atom) => mockValues[atom.key] })
      : options.variables;

  return resolver;
}

export function graphQLSelectorFamily<
  TVariables extends Variables,
  P extends SerializableParam,
  T,
>(options: {
  key: string;
  variables:
    | TVariables
    | ((
        params: P,
      ) =>
        | TVariables
        | ((accessors: {
            get: (state: { key: string }) => unknown;
          }) => TVariables));
}): (params: P) => Resolved<T, TVariables> {
  return (params) => {
    function resolver() {
      return mockValues[options.key];
    }
    resolver.key = options.key;
    resolver.params = params;
    resolver.variables = () => {
      if (options.variables instanceof Function) {
        const resolved = options.variables(params);

        if (resolved instanceof Function) {
          return resolved({ get: (atom) => mockValues[atom.key] });
        }

        return resolved;
      }

      return options.variables;
    };

    return resolver;
  };
}

export type TestGraphQLSelector<T, TVariables extends Variables, D> = {
  variables: () => TVariables;
  (): D;
  key: string;
};

export type TestGraphQLSelectorFamily<
  T,
  TVariables extends Variables,
  D,
  P extends SerializableParam,
> = (params: P) => {
  variables: () => TVariables;
  (): D;
  key: string;
};
