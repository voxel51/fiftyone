import { beforeEach, expect, it, vi } from "vitest";
import { listSubsets } from "./client";

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
