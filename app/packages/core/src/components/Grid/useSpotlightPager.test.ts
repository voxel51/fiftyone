import { renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useSpotlightPager from "./useSpotlightPager";

interface Call {
  page: number;
  next: (data: unknown) => void;
}

const calls: Call[] = [];

vi.mock("react-relay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-relay")>()),
  fetchQuery: (_, __, variables: { page: number }) => ({
    subscribe: ({ next }: { next: Call["next"] }) => {
      calls.push({ page: variables.page, next });
      return { unsubscribe: () => undefined };
    },
  }),
  useRelayEnvironment: () => ({}),
}));

vi.mock("recoil", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recoil")>()),
  useRecoilCallback: (callback: (ctx: unknown) => unknown, deps: unknown[]) =>
    useMemo(
      () => callback({ snapshot: { getPromise: async () => ({}) } }),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps, as in recoil
      deps,
    ),
  // selectors are passed in as their values
  useRecoilValue: (value: unknown) => value,
}));

vi.mock("@fiftyone/looker", () => ({ zoomAspectRatio: () => 1 }));
vi.mock("@fiftyone/relay", () => ({ paginateSamples: {} }));
vi.mock("@fiftyone/state", () => ({
  fieldSchema: () => null,
  State: { SPACE: { SAMPLE: "SAMPLE" } },
}));

vi.mock("./useTimeout", () => ({ default: () => () => undefined }));

const pager = (page: number) => ({ page });

const render = () =>
  renderHook(
    ({ clearRecords }: { clearRecords: string }) =>
      useSpotlightPager({
        clearRecords,
        pageSelector: pager as never,
        records: new Map(),
        zoomSelector: false as never,
      }),
    { initialProps: { clearRecords: "one" } },
  );

const requested = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return calls.map(({ page }) => page);
};

const respond = (page: number) => {
  for (const call of calls.filter((c) => c.page === page)) {
    call.next({ samples: { __typename: "Empty" } });
  }
};

describe("useSpotlightPager", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("prefetches the next page with each page", async () => {
    const { result } = render();

    result.current.page(0);

    expect(await requested()).toEqual([0, 1]);
  });

  it("serves a prefetched page without requesting it again", async () => {
    const { result } = render();
    result.current.page(0);
    await requested();
    respond(1);

    const page = result.current.page(1);

    expect(await requested()).toEqual([0, 1, 2]);
    await expect(page).resolves.toEqual({
      items: [],
      next: null,
      previous: null,
    });
  });

  it("does not prefetch backward or a page already requested", async () => {
    const { result } = render();
    result.current.page(4);
    await requested();

    result.current.page(3);

    expect(await requested()).toEqual([4, 5, 3]);
  });

  it("drops the prefetched page when records are cleared", async () => {
    const { result, rerender } = render();
    result.current.page(0);
    await requested();

    rerender({ clearRecords: "two" });
    result.current.page(1);

    expect(await requested()).toEqual([0, 1, 1, 2]);
  });
});
