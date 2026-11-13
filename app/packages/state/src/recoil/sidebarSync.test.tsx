import { act, cleanup, renderHook } from "@testing-library/react";
import {
  RecoilRoot,
  snapshot_UNSTABLE,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import type { TransactionInterface_UNSTABLE } from "recoil";
import type { OperationType } from "relay-runtime";
import type { PageQuery } from "@fiftyone/relay/src/Writer";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type PageSubscriber = (
  page: PageQuery<OperationType>,
  transaction?: TransactionInterface_UNSTABLE,
) => void;

const mocks = vi.hoisted(() => ({
  page: {} as PageQuery<OperationType>,
  subscribers: new Set<PageSubscriber>(),
}));

vi.mock("@fiftyone/relay/src/Writer", () => ({
  getPageQuery: () => ({
    pageQuery: mocks.page,
    subscribe: (callback: PageSubscriber) => {
      mocks.subscribers.add(callback);
      return () => mocks.subscribers.delete(callback);
    },
  }),
  registerPageSync: () => vi.fn(),
}));

vi.mock("@fiftyone/relay/src/utils", () => ({
  loadContext: (_fragment: unknown, _environment: unknown, data: unknown) => ({
    result: { data },
    FragmentResource: { subscribe: () => ({ dispose: vi.fn() }) },
  }),
  readFragment: (_fragment: unknown, data: unknown) => data,
  resolveFragmentChain: vi.fn(),
}));

const pageFor = (datasetId: string): PageQuery<OperationType> =>
  ({
    data: {
      dataset: {
        datasetId,
        sampleFields: [],
        frameFields: [],
        appConfig: {
          sidebarGroups: [
            { name: "events", paths: [], expanded: false },
            { name: "signals", paths: [], expanded: false },
          ],
        },
      },
    },
    preloadedQuery: { environment: {} },
  }) as unknown as PageQuery<OperationType>;

let sidebarGroupsDefinition: typeof import("./sidebar").sidebarGroupsDefinition;

beforeAll(async () => {
  // Exercise the production atom effects with only the Relay boundary mocked.
  vi.stubEnv("MODE", "development");
  ({ sidebarGroupsDefinition } = await import("./sidebar"));
});
beforeEach(() => {
  mocks.page = pageFor("dataset-a");
});
afterEach(cleanup);
afterAll(() => vi.unstubAllEnvs());

const refresh = () => {
  act(() => {
    for (const subscriber of mocks.subscribers) subscriber(mocks.page);
  });
};

describe("sidebar group synchronization", () => {
  it("keeps expansion choices through repeated refreshes and detached snapshot reads", async () => {
    const { result } = renderHook(
      () => ({
        groups: useRecoilState(sidebarGroupsDefinition(false)),
        // Writer delivers every subscriber's update into the live transaction.
        refresh: useRecoilTransaction_UNSTABLE(
          (transaction) => () => {
            for (const subscriber of mocks.subscribers)
              subscriber(mocks.page, transaction);
          },
          [],
        ),
      }),
      { wrapper: RecoilRoot },
    );
    act(() => {
      result.current.groups[1]((groups) =>
        groups.map((group) => ({
          ...group,
          expanded: ["events", "signals"].includes(group.name),
        })),
      );
    });
    act(() => result.current.refresh());

    const snapshot = snapshot_UNSTABLE();
    const release = snapshot.retain();
    try {
      await snapshot.getPromise(sidebarGroupsDefinition(false));

      expect(
        result.current.groups[0].find(({ name }) => name === "events")
          ?.expanded,
      ).toBe(true);
      for (let i = 0; i < 3; i++) act(() => result.current.refresh());
      expect(
        result.current.groups[0]
          .filter(({ name }) => ["events", "signals"].includes(name))
          .map(({ expanded }) => expanded),
      ).toEqual([true, true]);
    } finally {
      release();
    }
  });

  it("uses the new dataset defaults instead of carrying expansion across datasets", () => {
    const { result } = renderHook(
      () => useRecoilState(sidebarGroupsDefinition(false)),
      { wrapper: RecoilRoot },
    );
    act(() =>
      result.current[1]((groups) =>
        groups.map((group) => ({ ...group, expanded: true })),
      ),
    );
    mocks.page = pageFor("dataset-b");
    refresh();
    expect(
      result.current[0].find(({ name }) => name === "events")?.expanded,
    ).toBe(false);
  });

  it("keeps modal expansion choices independent of grid refreshes", () => {
    const { result } = renderHook(
      () => ({
        grid: useRecoilState(sidebarGroupsDefinition(false)),
        modal: useRecoilState(sidebarGroupsDefinition(true)),
      }),
      { wrapper: RecoilRoot },
    );
    act(() =>
      result.current.modal[1](
        result.current.grid[0].map((group) => ({ ...group, expanded: true })),
      ),
    );
    refresh();
    expect(
      result.current.grid[0].find(({ name }) => name === "events")?.expanded,
    ).toBe(false);
    expect(
      result.current.modal[0].find(({ name }) => name === "events")?.expanded,
    ).toBe(true);
  });
});
