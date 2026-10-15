import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { afterEach, expect, it, vi } from "vitest";
import useFetchGeoLocations, {
  sampleLocationMapAtom,
} from "./useFetchGeoLocations";
import type * as fos from "@fiftyone/state";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@fiftyone/utilities", () => ({ getFetchFunction: () => fetch }));
afterEach(cleanup);

it("keeps the current subset on late responses and reloads edited membership", async () => {
  let finish!: (value: object) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dataset = { name: "geo-scopes" } as fos.State.Dataset;
  const view: fos.State.Stage[] = [];
  const extended = {} as typeof fos.extendedStages;
  const { result, rerender } = renderHook(
    ({ subset, revision }) => {
      const status = useFetchGeoLocations({
        dataset,
        view,
        extended,
        filters: { _selection_scope: { subsetId: subset } },
        path: "location",
        revision,
      });
      return { ...status, points: useRecoilValue(sampleLocationMapAtom) };
    },
    { initialProps: { subset: "one", revision: 0 }, wrapper: RecoilRoot },
  );
  fetch.mockResolvedValue({ second: [1, 2] });
  rerender({ subset: "two", revision: 0 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.points).toEqual({ second: [1, 2] });
  await act(async () => finish({ first: [3, 4] }));
  expect(result.current.points).toEqual({ second: [1, 2] });
  fetch.mockResolvedValue({});
  rerender({ subset: "two", revision: 1 });
  await waitFor(() => expect(result.current.points).toEqual({}));
  expect(fetch).toHaveBeenLastCalledWith(
    "POST",
    "/geo",
    expect.objectContaining({
      filters: { _selection_scope: { subsetId: "two" } },
    }),
  );
});

it("refetches a failed scope but caches a successful empty response", async () => {
  fetch.mockReset().mockRejectedValueOnce(new Error("network unavailable"));
  const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dataset = { name: "geo-retry" } as fos.State.Dataset;
  const view: fos.State.Stage[] = [];
  const extended = {} as typeof fos.extendedStages;
  const filters = {};
  const mount = () =>
    renderHook(
      () => {
        const status = useFetchGeoLocations({
          dataset,
          view,
          extended,
          filters,
          path: "location",
          revision: 0,
        });
        return { ...status, points: useRecoilValue(sampleLocationMapAtom) };
      },
      { wrapper: RecoilRoot },
    );
  try {
    const first = mount();
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.points).toEqual({});
    first.unmount();

    fetch.mockResolvedValue({});
    const retry = mount();
    await waitFor(() => expect(retry.result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(retry.result.current.points).toEqual({});
    retry.unmount();

    const cached = mount();
    expect(cached.result.current.loading).toBe(false);
    expect(cached.result.current.points).toEqual({});
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    report.mockRestore();
  }
});
