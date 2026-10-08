/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ReverbRoot, atom, useReverbValue } from "@fiftyone/reverb";
import { render, screen, waitFor } from "@testing-library/react";
import { createStore } from "jotai";
import { Suspense } from "react";
import type { ConcreteRequest, IEnvironment, Snapshot } from "relay-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentKey, registerEnvironment } from "./ReverbRelayEnvironment";
import { graphQLSelector } from "./graphQLSelector";
import { graphQLSelectorFamily } from "./graphQLSelectorFamily";

const relay = vi.hoisted(() => ({
  started: [] as {
    error: (reason: unknown) => void;
    next: (data: Record<string, unknown>) => void;
    variables: Record<string, unknown>;
  }[],
}));

vi.mock("react-relay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-relay")>()),
  fetchQuery: (
    _environment: unknown,
    _request: unknown,
    variables: Record<string, unknown>,
  ) => ({
    subscribe: (observer: {
      error: (reason: unknown) => void;
      next: (data: Record<string, unknown>) => void;
    }) => {
      relay.started.push({
        error: observer.error,
        next: observer.next,
        variables,
      });

      return { unsubscribe: () => undefined };
    },
  }),
}));

const subscribers: ((snapshot: Snapshot) => void)[] = [];

/** Stands in for the parts of an environment this binding actually touches. */
const environment = {
  lookup: () => ({ data: {}, isMissingData: true }),
  retain: () => ({ dispose: () => undefined }),
  subscribe: (_snapshot: Snapshot, callback: (snapshot: Snapshot) => void) => {
    subscribers.push(callback);

    return { dispose: () => undefined };
  },
} as unknown as IEnvironment;

const operation = (operationKind: string): ConcreteRequest =>
  ({
    fragment: {
      abstractKey: null,
      argumentDefinitions: [],
      kind: "Fragment",
      metadata: null,
      name: "TestOperation",
      selections: [],
      type: "Query",
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [],
      kind: "Operation",
      name: "TestOperation",
      selections: [],
    },
    params: {
      cacheID: `test-${operationKind}`,
      id: null,
      metadata: {},
      name: "TestOperation",
      operationKind,
      text: "query TestOperation { __typename }",
    },
  }) as unknown as ConcreteRequest;

const query = operation("query");

const environmentKey = new EnvironmentKey("graphQLSelectorFamily-test");

const dataset = atom({ default: "quickstart", key: "test-dataset" });

interface CountResponse {
  count: number;
}

type Parameter = { path: string };

type CountVariables = { dataset: string; path: string };

let keys = 0;

const counts = (skip = false) =>
  graphQLSelectorFamily<CountVariables, Parameter, number, CountResponse>({
    environment: environmentKey,
    key: `counts-${++keys}`,
    mapResponse: (data) => data.count,
    query,
    variables:
      ({ path }) =>
      ({ get }) =>
        skip ? null : { dataset: get(dataset), path },
  });

beforeEach(() => {
  relay.started.length = 0;
  subscribers.length = 0;
  registerEnvironment(environment, environmentKey);
});

describe("graphQLSelectorFamily", () => {
  it("resolves a member from the query response", async () => {
    const store = createStore();
    const value = store.get(counts()({ path: "a" }));

    expect(relay.started).toHaveLength(1);
    expect(relay.started[0].variables).toStrictEqual({
      dataset: "quickstart",
      path: "a",
    });

    relay.started[0].next({ count: 3 });

    expect(await value).toBe(3);
  });

  it("resolves structurally equal parameters to one member", () => {
    const family = graphQLSelectorFamily<
      CountVariables,
      { extended: boolean; path: string },
      number,
      CountResponse
    >({
      environment: environmentKey,
      key: `equal-${++keys}`,
      mapResponse: (data) => data.count,
      query,
      variables:
        ({ path }) =>
        ({ get }) => ({ dataset: get(dataset), path }),
    });

    expect(family({ extended: false, path: "a" })).toBe(
      family({ path: "a", extended: false }),
    );

    const store = createStore();
    store.get(family({ extended: false, path: "a" }));
    store.get(family({ path: "a", extended: false }));

    expect(relay.started).toHaveLength(1);
  });

  it("fetches again when a variable changes, and not when it returns", async () => {
    const family = counts();
    const store = createStore();

    const first = store.get(family({ path: "a" }));
    relay.started[0].next({ count: 1 });
    expect(await first).toBe(1);

    store.set(dataset, "other");
    const second = store.get(family({ path: "a" }));

    expect(relay.started).toHaveLength(2);
    expect(relay.started[1].variables).toStrictEqual({
      dataset: "other",
      path: "a",
    });

    relay.started[1].next({ count: 2 });
    expect(await second).toBe(2);

    store.set(dataset, "quickstart");
    expect(await store.get(family({ path: "a" }))).toBe(1);
    expect(relay.started).toHaveLength(2);
  });

  it("reads as a settled value once a mounted member has its payload", async () => {
    const member = counts()({ path: "a" });
    const store = createStore();
    const unsubscribe = store.sub(member, () => undefined);

    expect(store.get(member)).toBeInstanceOf(Promise);
    relay.started[0].next({ count: 4 });

    await waitFor(() => expect(store.get(member)).toBe(4));
    unsubscribe();
  });

  it("surfaces a query error instead of hanging", async () => {
    const store = createStore();
    const value = store.get(counts()({ path: "a" }));

    relay.started[0].error(new Error("boom"));

    await expect(Promise.resolve(value)).rejects.toThrow("boom");
  });

  it("suspends until the response arrives", async () => {
    const family = counts();
    const Count = () => (
      <span>{`count ${useReverbValue(family({ path: "a" }))}`}</span>
    );

    render(
      <ReverbRoot>
        <Suspense fallback={<span>loading</span>}>
          <Count />
        </Suspense>
      </ReverbRoot>,
    );

    expect(screen.getByText("loading")).toBeTruthy();
    await waitFor(() => expect(relay.started).toHaveLength(1));

    relay.started[0].next({ count: 5 });

    await waitFor(() => expect(screen.getByText("count 5")).toBeTruthy());
  });

  it("skips the query and suspends when variables are null", async () => {
    const store = createStore();
    const value = store.get(counts(true)({ path: "a" }));

    expect(relay.started).toHaveLength(0);

    const outcome = await Promise.race([
      Promise.resolve(value).then(() => "settled"),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("pending"), 10),
      ),
    ]);

    expect(outcome).toBe("pending");
  });

  it("uses the default instead of suspending when variables are null", () => {
    const family = graphQLSelectorFamily<
      CountVariables,
      Parameter,
      number,
      CountResponse
    >({
      default: -1,
      environment: environmentKey,
      key: `default-${++keys}`,
      mapResponse: (data) => data.count,
      query,
      variables: () => () => null,
    });

    const store = createStore();

    expect(store.get(family({ path: "a" }))).toBe(-1);
    expect(relay.started).toHaveLength(0);
  });

  it("follows a local write to the same part of the graph", async () => {
    const member = counts()({ path: "a" });
    const store = createStore();
    const unsubscribe = store.sub(member, () => undefined);

    const value = store.get(member);
    relay.started[0].next({ count: 1 });
    expect(await value).toBe(1);

    expect(subscribers).toHaveLength(1);
    subscribers[0]({
      data: { count: 9 },
      isMissingData: false,
    } as unknown as Snapshot);

    await waitFor(() => expect(store.get(member)).toBe(9));
    unsubscribe();
  });

  it("holds a write as a local cache of the server", async () => {
    const member = counts()({ path: "a" });
    const store = createStore();

    const value = store.get(member);
    relay.started[0].next({ count: 1 });
    expect(await value).toBe(1);

    store.set(member, 42);

    expect(store.get(member)).toBe(42);
  });

  it("rejects an operation that is not a query", () => {
    expect(() =>
      graphQLSelectorFamily<CountVariables, Parameter, number, CountResponse>({
        environment: environmentKey,
        key: `subscription-${++keys}`,
        mapResponse: (data) => data.count,
        query: operation("subscription"),
        variables: () => () => null,
      }),
    ).toThrow(/runs queries/);
  });
});

describe("graphQLSelector", () => {
  it("resolves a single member from the query response", async () => {
    const single = graphQLSelector<CountVariables, number, CountResponse>({
      environment: environmentKey,
      key: `single-${++keys}`,
      mapResponse: (data) => data.count,
      query,
      variables: ({ get }) => ({ dataset: get(dataset), path: "a" }),
    });

    const store = createStore();
    const value = store.get(single);

    expect(relay.started[0].variables).toStrictEqual({
      dataset: "quickstart",
      path: "a",
    });

    relay.started[0].next({ count: 7 });

    expect(await value).toBe(7);
  });
});
