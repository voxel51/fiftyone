import type { TransactionInterface_UNSTABLE } from "recoil";
import type { GraphQLTaggedNode, OperationType } from "relay-runtime";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PageQuery } from "./Writer";

const mocks = vi.hoisted(() => ({
  loadContext: vi.fn(),
  registerPageSync: vi.fn(),
  resolveFragmentChain: vi.fn(),
}));

vi.mock("./utils", () => ({
  loadContext: mocks.loadContext,
  resolveFragmentChain: mocks.resolveFragmentChain,
}));

vi.mock("./Writer", () => ({
  getPageQuery: vi.fn(),
  registerPageSync: mocks.registerPageSync,
}));

const fragment = {} as GraphQLTaggedNode;
const page = {
  data: {},
  preloadedQuery: { environment: {} },
} as unknown as PageQuery<OperationType>;

const createPageSync = async (
  key: string,
  options: { default: unknown; read?: ReturnType<typeof vi.fn> },
) => {
  const { graphQLSyncFragmentAtom } = await import("./graphQLSyncFragmentAtom");
  const value = graphQLSyncFragmentAtom(
    {
      default: options.default,
      fragments: [fragment],
      keys: ["dataset"],
      read: options.read as never,
    },
    { key },
  );
  const subscriber = mocks.registerPageSync.mock.calls[0][1] as (
    page: PageQuery<OperationType>,
    transaction: TransactionInterface_UNSTABLE,
  ) => void;

  return { subscriber, value };
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MODE", "development");
  mocks.loadContext.mockReset();
  mocks.registerPageSync.mockReset();
  mocks.resolveFragmentChain.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("graphQLSyncFragmentAtom page synchronization", () => {
  test("resets when the page is missing a fragment parent", async () => {
    const defaultValue = { state: "default" };
    const { subscriber, value } = await createPageSync("page-sync-missing", {
      default: defaultValue,
    });
    const set = vi.fn();
    mocks.resolveFragmentChain.mockReturnValue({ missing: true });

    subscriber(page, { set } as unknown as TransactionInterface_UNSTABLE);

    expect(set).toHaveBeenCalledWith(value, defaultValue);
  });

  test("resets when fragment resolution throws", async () => {
    const defaultValue = { state: "default" };
    const { subscriber, value } = await createPageSync("page-sync-error", {
      default: defaultValue,
    });
    const set = vi.fn();
    mocks.resolveFragmentChain.mockImplementation(() => {
      throw new Error("incompatible fragment");
    });

    subscriber(page, { set } as unknown as TransactionInterface_UNSTABLE);

    expect(set).toHaveBeenCalledWith(value, defaultValue);
  });

  test("passes current and previous fragment data to read", async () => {
    const first = { id: "first" };
    const second = { id: "second" };
    const read = vi.fn((current, previous) => ({ current, previous }));
    const { subscriber, value } = await createPageSync("page-sync-read", {
      default: null,
      read,
    });
    const set = vi.fn();
    const transaction = {
      set,
    } as unknown as TransactionInterface_UNSTABLE;
    mocks.resolveFragmentChain
      .mockReturnValueOnce({ data: first, missing: false })
      .mockReturnValueOnce({ data: second, missing: false });

    subscriber(page, transaction);
    subscriber(page, transaction);

    expect(read).toHaveBeenNthCalledWith(1, first, null);
    expect(read).toHaveBeenNthCalledWith(2, second, first);
    expect(set).toHaveBeenNthCalledWith(1, value, {
      current: first,
      previous: null,
    });
    expect(set).toHaveBeenNthCalledWith(2, value, {
      current: second,
      previous: first,
    });
  });
});
