import { SerializableParam } from "recoil";
import * as recoilRelay from "recoil-relay";
export * from "recoil-relay";
import { Variables } from "relay-runtime";

import { mockValues } from "./recoil";

export function graphQLSelector<TVariables extends Variables, T>(
  options: Parameters<typeof recoilRelay.graphQLSelector<TVariables, T>>[0]
): { (): T; variables: () => TVariables | null; key: string } {
  function resolver(): T {
    return mockValues[options.key];
  }
  resolver.key = options.key;
  resolver.variables = () =>
    options.variables instanceof Function
      ? options.variables({
          get: (atom) => {
            return mockValues[atom.key];
          },
        })
      : options.variables;

  return resolver;
}

export function graphQLSelectorFamily<
  TVariables extends Variables,
  P extends SerializableParam,
  T
>(
  options: Parameters<
    typeof recoilRelay.graphQLSelectorFamily<TVariables, P, T>
  >[0]
): (params: P) => { (): T; variables: () => TVariables | null; key: string } {
  return (params) => {
    function resolver() {
      return mockValues[options.key];
    }
    resolver.key = options.key;
    resolver.variables = () => {
      if (options.variables instanceof Function) {
        const resolved = options.variables(params);

        if (resolved instanceof Function) {
          return resolved({
            get: (atom) => {
              return mockValues[atom.key];
            },
          });
        }

        return resolved;
      }

      return options.variables;
    };

    return resolver;
  };
}

export type TestGraphQLSelector<T, TVariables extends Variables, D> = {
  variables: T extends typeof recoilRelay.graphQLSelector<TVariables, D>
    ? () => TVariables
    : never;
  (): D;
  key: string;
};

export type TestGraphQLSelectorFamily<
  T,
  TVariables extends Variables,
  D,
  P extends SerializableParam
> = (params) => {
  variables: T extends typeof recoilRelay.graphQLSelectorFamily<
    TVariables,
    P,
    D
  >
    ? () => TVariables
    : never;
  (): D;
  key: string;
};
