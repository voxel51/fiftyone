import query from "@fiftyone/relay/src/queries/__generated__/paginateSamplesQuery.graphql";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { atom, RecoilRoot, selector } from "recoil";
import {
  createOperationDescriptor,
  Environment,
  Network,
  RecordSource,
  Store,
  type GraphQLResponse,
} from "relay-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import useSpotlightPager from "./useSpotlightPager";

vi.mock("@fiftyone/relay", async () => ({
  paginateSamples: (
    await import("@fiftyone/relay/src/queries/__generated__/paginateSamplesQuery.graphql")
  ).default,
}));
vi.mock("@fiftyone/looker", () => ({ zoomAspectRatio: vi.fn() }));
vi.mock("@fiftyone/state", async () => {
  const { atom } = await import("recoil");
  const schema = atom({ key: "pager-test-schema", default: {} });
  return { fieldSchema: () => schema, State: { SPACE: { SAMPLE: "sample" } } };
});
vi.mock("@fiftyone/state/src/selection", () => {
  const boundary = {};
  const report = vi.fn();
  return {
    useGridSelectionBoundary: () => [boundary],
    useGridSelectionDataset: () => ({ enabled: false }),
    useGridSelectionPagingError: () => report,
  };
});
vi.mock("react-error-boundary", () => {
  const handleError = vi.fn();
  return { useErrorHandler: () => handleError };
});
vi.mock("./useTimeout", () => {
  const timeout = vi.fn();
  return { default: () => timeout };
});

const variables = (page: number) => ({
  dataset: "grid",
  view: [],
  filter: {},
  after: page ? String(page * 20 - 1) : null,
});
const pageSelector = selector({
  key: "pager-test-variables",
  get: () => variables,
});
const zoomSelector = atom({ key: "pager-test-zoom", default: false });

const payload = (tags: string[]) => ({
  samples: {
    __typename: "SampleItemStrConnection",
    edges: [
      {
        cursor: "20",
        node: {
          __typename: "ImageSample",
          id: "sample-21",
          aspectRatio: 1,
          sample: { _id: "sample-21", tags },
          urls: [],
        },
      },
    ],
    pageInfo: { hasNextPage: true },
  },
});

function setup() {
  const responses: ((response: GraphQLResponse) => void)[] = [];
  const fetch = vi.fn(
    () => new Promise<GraphQLResponse>((resolve) => responses.push(resolve)),
  );
  const environment = new Environment({
    network: Network.create(fetch),
    store: new Store(new RecordSource()),
  });
  // Simulate a page already visited before the bulk tag.
  environment.commitPayload(
    createOperationDescriptor(query, variables(1)),
    payload([]),
  );
  const records = new Map<string, number>();
  const hook = renderHook(
    (clearRecords: string) =>
      useSpotlightPager({ clearRecords, pageSelector, records, zoomSelector }),
    {
      initialProps: "initial",
      wrapper: ({ children }: React.PropsWithChildren) => (
        <RecoilRoot>
          <RelayEnvironmentProvider environment={environment}>
            {children}
          </RelayEnvironmentProvider>
        </RecoilRoot>
      ),
    },
  );
  return { ...hook, fetch, responses };
}

afterEach(cleanup);

describe("useSpotlightPager", () => {
  it("waits for fresh data for overlapping requests of a cached page", async () => {
    const { result, fetch, responses } = setup();
    const first = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = result.current.page(1);
    // Let the second call read its Recoil schema and choose a fetch policy
    // while the first network request is still pending.
    await Promise.resolve();
    responses[0]({ data: payload(["grid-test"]) });

    for (const page of await Promise.all([first, second])) {
      expect(result.current.store.get(page.items[0].id)?.sample.tags).toEqual([
        "grid-test",
      ]);
    }
    // Relay deduplicates the two network-only requests.
    expect(fetch).toHaveBeenCalledTimes(1);
    await result.current.page(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetches visited pages again after a grid reset", async () => {
    const { result, rerender, fetch, responses } = setup();
    const first = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    responses[0]({ data: payload([]) });
    await first;

    rerender("refreshed");
    const refreshed = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    responses[1]({ data: payload(["grid-test"]) });
    const page = await refreshed;
    expect(result.current.store.get(page.items[0].id)?.sample.tags).toEqual([
      "grid-test",
    ]);
  });
});
