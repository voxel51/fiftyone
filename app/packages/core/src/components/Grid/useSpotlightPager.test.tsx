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

const { navigate, report, handleError } = vi.hoisted(() => ({
  navigate: vi.fn(),
  report: vi.fn(),
  handleError: vi.fn(),
}));

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
  return {
    resolveGridLocation: navigate,
    useGridSelectionBoundary: () => [boundary],
    useGridSelectionDataset: () => ({ enabled: false, datasetId: "dataset" }),
    useGridSelectionPagingError: () => report,
  };
});
vi.mock("react-error-boundary", () => ({ useErrorHandler: () => handleError }));
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
  const resetLocation = vi.fn();
  const hook = renderHook(
    (clearRecords: string) =>
      useSpotlightPager({
        clearRecords,
        scopeKey: "scope",
        pageSelector,
        records,
        resetLocation,
        zoomSelector,
      }),
    {
      initialProps: "initial",
      wrapper: ({ children }: React.PropsWithChildren) => (
        <React.StrictMode>
          <RecoilRoot>
            <RelayEnvironmentProvider environment={environment}>
              {children}
            </RelayEnvironmentProvider>
          </RecoilRoot>
        </React.StrictMode>
      ),
    },
  );
  return { ...hook, fetch, responses, records, resetLocation };
}

afterEach(() => {
  cleanup();
  navigate.mockReset();
  report.mockReset();
  handleError.mockReset();
});

describe("useSpotlightPager", () => {
  it("reuses cached video metadata for an eager tray preview without another fetch", async () => {
    const { result, fetch, responses } = setup();
    const pending = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const data = payload([]);
    responses[0]({
      data: {
        samples: {
          ...data.samples,
          edges: [
            {
              ...data.samples.edges[0],
              node: {
                ...data.samples.edges[0].node,
                __typename: "VideoSample",
                frameRate: 30,
                aspectRatio: 16 / 9,
              },
            },
          ],
        },
      },
    });
    const page = await pending;
    expect(result.current.getPreview("sample-21")).toBe(page.items[0].data);
    expect(result.current.getPreview("sample-21")).toMatchObject({
      frameRate: 30,
      aspectRatio: 16 / 9,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps ordinary query timeouts out of the grid error boundary", async () => {
    const { result, fetch, responses } = setup();
    const pending = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    responses[0]({
      data: { samples: { __typename: "QueryTimeout", queryTime: 5 } },
    });
    expect(await pending).toEqual({ items: [], previous: null, next: null });
    expect(handleError).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("waits for fresh data for overlapping requests of a cached page", async () => {
    const { result, fetch, responses } = setup();
    const first = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = result.current.page(1);
    // Let the second call read its Recoil schema and choose a fetch policy
    // while the first network request is still pending.
    await Promise.resolve();
    responses[0]({ data: payload(["grid-test"]) });

    const pages = await Promise.all([first, second]);
    for (const page of pages) {
      expect(result.current.store.get(page.items[0].id)?.sample).toMatchObject({
        tags: ["grid-test"],
      });
    }
    expect(result.current.getPreview("sample-21")).toBe(pages[1].items[0].data);
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
    expect(result.current.getPreview("sample-21")).toBeUndefined();
    const refreshed = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    responses[1]({ data: payload(["grid-test"]) });
    const page = await refreshed;
    expect(result.current.store.get(page.items[0].id)?.sample).toMatchObject({
      tags: ["grid-test"],
    });
    expect(result.current.getPreview("sample-21")?.sample.tags).toEqual([
      "grid-test",
    ]);
  });

  it("does not seed a new grid with a page that finishes after reset", async () => {
    const { result, rerender, fetch, responses } = setup();
    const pending = result.current.page(1);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender("another-dataset");
    responses[0]({ data: payload([]) });
    await pending;
    expect(result.current.getPreview("sample-21")).toBeUndefined();
  });
  it("prepares an identity destination without changing the current grid and seeds the replacement", async () => {
    const { result, records, fetch, rerender } = setup();
    records.set("old", 999_999);
    const nodes = payload([]).samples.edges.map((edge) => edge.node);
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes,
      previous: null,
      next: { sampleId: "sample-21", direction: "after" },
    });
    const signal = new AbortController().signal;
    const destination = await result.current.prepare(
      "dataset",
      { view: [], filters: {}, extendedStages: {}, boundary: {} },
      "sample-21",
      signal,
    );
    expect(records.get("old")).toBe(999_999);
    expect(result.current.getPreview("sample-21")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    destination!.commit();
    rerender("jump");
    const page = await result.current.page(0);
    expect(page.items.map((item) => item.id.description)).toEqual([
      "sample-21",
    ]);
    expect(records.has("old")).toBe(false);
    expect(page.previous).toBeNull();
    expect(page.next).toBe(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes: [],
      previous: null,
      next: null,
    });
    await result.current.page(1);
    expect(navigate).toHaveBeenLastCalledWith(
      "dataset",
      expect.objectContaining({ sampleId: "sample-21", direction: "after" }),
      expect.any(AbortSignal),
    );
  });

  it("does not commit a cancelled destination", async () => {
    const { result, records } = setup();
    records.set("old", 25);
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes: payload([]).samples.edges.map((edge) => edge.node),
      previous: null,
      next: null,
    });
    const controller = new AbortController();
    const destination = await result.current.prepare(
      "dataset",
      { view: [], filters: {}, extendedStages: {}, boundary: {} },
      "sample-21",
      controller.signal,
    );
    controller.abort();
    expect(() => destination!.commit()).toThrow();
    expect(records.get("old")).toBe(25);
  });

  it.each(["expired", "deleted"])(
    "recovers from a %s seek bookmark into ordinary paging",
    async (reason) => {
      const { result, resetLocation, rerender, fetch, responses, records } =
        setup();
      navigate.mockResolvedValueOnce({
        kind: "seek",
        nodes: payload([]).samples.edges.map((edge) => edge.node),
        previous: null,
        next: null,
      });
      const destination = await result.current.prepare(
        "dataset",
        { view: [], filters: {}, extendedStages: {}, boundary: {} },
        "sample-21",
        new AbortController().signal,
      );
      destination!.commit();
      rerender("jump");
      await result.current.page(0, "jump");
      navigate.mockResolvedValueOnce({ kind: "missing" });
      expect(
        await result.current.page(reason === "expired" ? 999 : 0, "jump"),
      ).toEqual({
        items: [],
        previous: null,
        next: null,
      });
      expect(resetLocation).toHaveBeenCalledOnce();
      expect(records.size).toBe(0);
      rerender("recovered");
      const first = result.current.page(0, "recovered");
      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      responses[0]({ data: payload([]) });
      expect((await first).items).toHaveLength(1);
      expect(fetch.mock.calls[0]).toContainEqual(
        expect.objectContaining({ after: null }),
      );
      expect(report).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    },
  );

  it("does not let a stale missing cursor reset a newer destination", async () => {
    const { result, resetLocation, rerender } = setup();
    const location = {
      kind: "seek",
      nodes: payload([]).samples.edges.map((edge) => edge.node),
      previous: null,
      next: { sampleId: "sample-21", direction: "after" },
    };
    const prepare = () =>
      result.current.prepare(
        "dataset",
        { view: [], filters: {}, extendedStages: {}, boundary: {} },
        "sample-21",
        new AbortController().signal,
      );
    navigate.mockResolvedValueOnce(location);
    (await prepare())!.commit();
    rerender("first-jump");
    let finish!: (value: { kind: "missing" }) => void;
    navigate.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const old = result.current.page(1, "first-jump");
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    navigate.mockResolvedValueOnce(location);
    (await prepare())!.commit();
    rerender("next-jump");
    finish({ kind: "missing" });
    await old;
    expect(resetLocation).not.toHaveBeenCalled();
    expect((await result.current.page(0, "next-jump")).items).toHaveLength(1);
  });

  it("rejects outgoing grid calls made after a destination commits", async () => {
    const { result, resetLocation, rerender } = setup();
    const outgoing = result.current.page;
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes: payload([]).samples.edges.map((edge) => edge.node),
      previous: null,
      next: null,
    });
    const destination = await result.current.prepare(
      "dataset",
      { view: [], filters: {}, extendedStages: {}, boundary: {} },
      "sample-21",
      new AbortController().signal,
    );
    destination!.commit();
    // Before React renders, the old lifetime is already retired.
    expect((await outgoing(999, "initial")).items).toHaveLength(0);
    rerender("jump");
    // After rendering, the old Spotlight still calls through the latest ref.
    expect((await result.current.page(999, "initial")).items).toHaveLength(0);
    expect((await result.current.page(0, "initial")).items).toHaveLength(0);
    expect(resetLocation).not.toHaveBeenCalled();
    expect((await result.current.page(0, "jump")).items).toHaveLength(1);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not reset the viewport when a range needs an expired bookmark", async () => {
    const { result, resetLocation, rerender } = setup();
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes: payload([]).samples.edges.map((edge) => edge.node),
      previous: null,
      next: null,
    });
    const destination = await result.current.prepare(
      "dataset",
      { view: [], filters: {}, extendedStages: {}, boundary: {} },
      "sample-21",
      new AbortController().signal,
    );
    destination!.commit();
    rerender("jump");
    await result.current.page(999);
    expect(resetLocation).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("expired") }),
    );
    expect((await result.current.page(0, "jump")).items).toHaveLength(1);
  });

  it("keeps a stale destination retryable rather than marking it missing", async () => {
    const { result } = setup();
    navigate.mockResolvedValueOnce({
      kind: "seek",
      nodes: [],
      previous: null,
      next: null,
    });
    await expect(
      result.current.prepare(
        "dataset",
        { view: [], filters: {}, extendedStages: {}, boundary: {} },
        "sample-21",
        new AbortController().signal,
      ),
    ).rejects.toThrow("The grid results changed");
  });
});
