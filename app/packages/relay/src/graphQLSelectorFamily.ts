/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DefaultValue,
  type Family,
  type GetReverbValue,
  type ReverbState,
  atomFamily,
  selectorFamily,
} from "@fiftyone/reverb";
import { type Atom, atom as primitive } from "jotai";
import {
  type GraphQLTaggedNode,
  type IEnvironment,
  type Variables,
  getRequest,
} from "relay-runtime";
import { EnvironmentKey, resolveEnvironment } from "./ReverbRelayEnvironment";
import {
  type QueryResponse,
  type QuerySource,
  querySource,
} from "./graphQLQuerySource";

export type GraphQLEnvironmentOption = EnvironmentKey | IEnvironment;

export interface MapResponseCallbacks<TVariables> {
  get: GetReverbValue;
  variables: TVariables;
}

type VariablesResult<TVariables> =
  | TVariables
  | null
  | ((accessors: { get: GetReverbValue }) => TVariables | null);

export interface GraphQLSelectorFamilyOptions<TVariables, P, T, TData> {
  /** Used when `variables` resolves to null, which skips the query. */
  default?: T | ((parameter: P) => T);
  environment: GraphQLEnvironmentOption;
  key: string;
  mapResponse: (
    data: TData,
    callbacks: MapResponseCallbacks<TVariables>,
  ) => T | ((parameter: P) => T);
  query: GraphQLTaggedNode;
  variables: TVariables | ((parameter: P) => VariablesResult<TVariables>);
}

/** A value that never arrives, which is how a skipped query suspends. */
const NEVER: Promise<never> = new Promise(() => undefined);

/**
 * Suspension and failure both travel as the value, so a promise stands in for
 * one. A consumer unwraps it; nothing reads it as a T.
 */
const unresolved = <T>(promise: Promise<unknown>): T => promise as unknown as T;

interface Override<T, P> {
  data: T;
  parameter: P;
  reset: boolean;
}

interface Member<TData> {
  value: Atom<TData | Promise<TData>>;
}

/**
 * State backed by a GraphQL query, where the family parameter and upstream
 * state together name the variables. Writable as a local cache of the server.
 */
export function graphQLSelectorFamily<
  TVariables extends Variables,
  P,
  T,
  TData extends object = QueryResponse,
>(
  options: GraphQLSelectorFamilyOptions<TVariables, P, T, TData>,
): Family<P, ReverbState<T>> {
  const request = getRequest(options.query);
  if (request.params.operationKind !== "query") {
    throw new Error(
      `${options.key} names a ${request.params.operationKind}, and graphQLSelectorFamily runs queries`,
    );
  }

  const hasDefault = "default" in options;

  const defaultFor = (parameter: P): T =>
    typeof options.default === "function"
      ? (options.default as (parameter: P) => T)(parameter)
      : (options.default as T);

  const variablesFor = (
    parameter: P,
    get: GetReverbValue,
  ): TVariables | null => {
    const intermediate =
      typeof options.variables === "function"
        ? (options.variables as (parameter: P) => VariablesResult<TVariables>)(
            parameter,
          )
        : options.variables;

    return typeof intermediate === "function"
      ? (
          intermediate as (accessors: {
            get: GetReverbValue;
          }) => TVariables | null
        )({ get })
      : intermediate;
  };

  const member = (variables: TVariables): Member<TData> => {
    /**
     * Keyed by environment so a replaced one queries again rather than serving
     * what the previous one fetched.
     */
    const sources = new WeakMap<IEnvironment, QuerySource<TData>>();
    const source = (): QuerySource<TData> => {
      const environment = resolveEnvironment(options.environment);
      let held = sources.get(environment);

      if (held === undefined) {
        held = querySource<TData>(environment, request, variables);
        sources.set(environment, held);
      }

      return held;
    };

    const revision = primitive(0);
    revision.debugLabel = `${options.key}(${JSON.stringify(variables)})/revision`;
    revision.onMount = (bump) => source().activate(() => bump((n) => n + 1));

    const value = primitive((get) => {
      get(revision);

      return source().read();
    });

    return { value };
  };

  /**
   * One member per distinct variables value, which is what makes a variable
   * change fetch again and an unchanged one reuse the value already fetched.
   */
  const members = atomFamily<Member<TData>, TVariables>({
    default: member,
    key: `${options.key}__source`,
  });

  const overrides = atomFamily<Override<T, P> | null, TVariables | null>({
    default: null,
    key: `${options.key}__override`,
  });

  return selectorFamily<T, P>({
    get:
      (parameter) =>
      ({ get }) => {
        const variables = variablesFor(parameter, get);
        const override = get(overrides(variables));

        if (override !== null) {
          return override.reset ? unresolved<T>(NEVER) : override.data;
        }

        if (variables === null) {
          return hasDefault ? defaultFor(parameter) : unresolved<T>(NEVER);
        }

        const apply = (data: TData): T => {
          const mapped = options.mapResponse(data, { get, variables });

          return typeof mapped === "function"
            ? (mapped as (parameter: P) => T)(parameter)
            : (mapped as T);
        };

        const raw = get(get(members(variables)).value);

        return raw instanceof Promise
          ? unresolved<T>(raw.then(apply))
          : apply(raw);
      },
    key: `${options.key}__Wrapper`,
    set:
      (parameter) =>
      ({ get, set }, newValue) => {
        const variables = variablesFor(parameter, get);

        if (newValue instanceof DefaultValue) {
          /**
           * Without a default a reset has nothing to fall back to, so it
           * suspends exactly as a skipped query does.
           */
          set(
            overrides(variables),
            hasDefault
              ? { data: defaultFor(parameter), parameter, reset: false }
              : { data: undefined, parameter, reset: true },
          );

          return;
        }

        set(overrides(variables), { data: newValue, parameter, reset: false });
      },
  });
}
