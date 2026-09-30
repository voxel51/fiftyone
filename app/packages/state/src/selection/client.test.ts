import { beforeEach, expect, it, vi } from "vitest";
import { listSubsets, resolveSelection } from "./client";

const request = vi.hoisted(() => vi.fn());
vi.mock("@fiftyone/utilities", () => ({
  getFetchFunctionExtended: () => request,
}));

beforeEach(() => {
  request.mockReset().mockResolvedValue({
    response: { subsets: [], total: 0, count: 0 },
  });
});

it("distinguishes all dataset subsets from compatible sample subsets", async () => {
  await listSubsets("dataset");
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: "/dataset/dataset/subsets" }),
  );

  await listSubsets("dataset", { view: [] });
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: "/dataset/dataset/subsets?view=%5B%5D" }),
  );
});

it("cancels again when creation finishes after the caller aborts", async () => {
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const result = resolveSelection(
    "dataset",
    { view: [], filters: {}, extendedStages: {}, boundary: {} },
    controller.signal,
  );
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  expect(request).toHaveBeenCalledTimes(2);
  finish({ response: { state: "requested", result: null } });
  await rejected;
  expect(request).toHaveBeenCalledTimes(3);
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: { action: "cancel" } }),
  );
});
