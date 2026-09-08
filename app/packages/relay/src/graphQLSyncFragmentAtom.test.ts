import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import type { TransactionInterface_UNSTABLE } from "recoil";
import type { GraphQLTaggedNode, OperationType } from "relay-runtime";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PageQuery } from "./Writer";

const mocks = vi.hoisted(() => ({
  getPageQuery: vi.fn(),
  loadContext: vi.fn(),
  registerPageSync: vi.fn(),
  resolveFragmentChain: vi.fn(),
}));

vi.mock("./utils", () => ({
  loadContext: mocks.loadContext,
  resolveFragmentChain: mocks.resolveFragmentChain,
}));

vi.mock("./Writer", () => ({
  getPageQuery: mocks.getPageQuery,
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

const mountAtomEffect = async (key: string) => {
  const subscribe = vi.fn(() => vi.fn());
  mocks.getPageQuery.mockReturnValue({ pageQuery: page, subscribe });
  const { graphQLSyncFragmentAtom } = await import("./graphQLSyncFragmentAtom");
  const value = graphQLSyncFragmentAtom(
    { default: null, fragments: [fragment], keys: ["dataset"] },
    { key },
  );
  const Reader = () => {
    useRecoilValue(value);
    return null;
  };

  return {
    ...render(createElement(RecoilRoot, null, createElement(Reader))),
    subscribe,
  };
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MODE", "development");
  mocks.getPageQuery.mockReset();
  mocks.loadContext.mockReset();
  mocks.registerPageSync.mockReset();
  mocks.resolveFragmentChain.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("graphQLSyncFragmentAtom effect retries", () => {
  test("does not subscribe without a resolved fragment context", async () => {
    const fragmentSubscribe = vi.fn(() => ({ dispose: vi.fn() }));
    mocks.resolveFragmentChain.mockReturnValueOnce({
      context: {
        FragmentResource: { subscribe: fragmentSubscribe },
        result: {},
      },
      data: { id: "initial" },
      missing: false,
      parent: {},
    });

    const { subscribe, unmount } = await mountAtomEffect(
      "effect-missing-context",
    );
    const publishPage = subscribe.mock.calls[0][0] as (
      page: PageQuery<OperationType>,
    ) => void;
    mocks.resolveFragmentChain.mockReturnValueOnce({ missing: true });

    publishPage(page);

    expect(fragmentSubscribe).toHaveBeenCalledOnce();
    unmount();
  });

  test("tracks the live subscription created by a retry", async () => {
    const retryDispose = vi.fn();
    const liveDispose = vi.fn();
    let retryCallback: (() => void) | undefined;
    const retryContext = {
      FragmentResource: {
        subscribe: vi.fn((_result, callback) => {
          retryCallback = callback;
          return { dispose: retryDispose };
        }),
      },
      result: {},
    };
    const liveContext = {
      FragmentResource: {
        subscribe: vi.fn(() => ({ dispose: liveDispose })),
      },
      result: {},
    };
    mocks.resolveFragmentChain
      .mockReturnValueOnce({ context: retryContext, missing: true })
      .mockReturnValueOnce({
        context: liveContext,
        data: { id: "resolved" },
        missing: false,
        parent: {},
      });

    const { unmount } = await mountAtomEffect("effect-retry-subscription");
    retryCallback?.();
    unmount();

    expect(retryDispose).toHaveBeenCalled();
    expect(liveDispose).toHaveBeenCalled();
  });
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

  test("clears previous fragment data before resuming after a reset", async () => {
    const first = { id: "first" };
    const second = { id: "second" };
    const read = vi.fn((current, previous) => ({ current, previous }));
    const { subscriber } = await createPageSync("page-sync-reset-resume", {
      default: null,
      read,
    });
    const transaction = {
      set: vi.fn(),
    } as unknown as TransactionInterface_UNSTABLE;
    mocks.resolveFragmentChain
      .mockReturnValueOnce({ data: first, missing: false })
      .mockReturnValueOnce({ missing: true })
      .mockReturnValueOnce({ data: second, missing: false });

    subscriber(page, transaction);
    subscriber(page, transaction);
    subscriber(page, transaction);

    expect(read).toHaveBeenLastCalledWith(second, null);
  });
});
