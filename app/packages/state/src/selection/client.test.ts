import { beforeEach, expect, it, vi } from "vitest";
import {
  listSubsets,
  resolveSelection,
  selectionTagsRequest,
  updateSubset,
} from "./client";

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

it("updates metadata in the dataset-scoped subset endpoint", async () => {
  const info = { name: "Reviewed", description: null };
  await updateSubset("dataset/name", "subset/id", info);
  expect(request).toHaveBeenCalledWith({
    method: "POST",
    path: "/dataset/dataset%2Fname/subsets/subset%2Fid",
    body: info,
  });
});

it("sends all tag edits together and disables automatic mutation retries", async () => {
  const scope = { kind: "members" as const, members: [] };
  await selectionTagsRequest("dataset", scope, {
    changes: { train: true, test: false },
    target: "members",
    view: [],
  });
  expect(request).toHaveBeenLastCalledWith({
    method: "POST",
    path: "/dataset/dataset/selection/tags",
    retries: 0,
    body: {
      members: [],
      changes: { train: true, test: false },
      target: "members",
      view: [],
    },
  });
  await selectionTagsRequest("dataset", scope);
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({ retries: undefined }),
  );
});
