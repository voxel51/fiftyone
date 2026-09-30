import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSubsetJobs, useTrackSubsetJobs } from "./jobs";
import type { SelectionJob, SubsetAddResult } from "./client";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  request: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../hooks/useRefresh", () => ({ default: () => mocks.refresh }));
vi.mock("./client", () => ({
  startSelectionJob: mocks.start,
  selectionJobRequest: mocks.request,
}));
const counts = {
  episodes: 10,
  fullEpisodes: 10,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};
const subset = {
  id: "subset",
  name: "Review",
  counts,
  memberCount: counts.fullEpisodes,
  memberCounts: counts,
};
const job = (
  id: string,
  state: SelectionJob["state"] = "running",
): SelectionJob<SubsetAddResult> => ({
  id,
  kind: "add",
  state,
  cancelRequested: false,
  error: null,
  progress: { phase: "applying", done: 3, total: 10, added: 3 },
  result:
    state === "completed"
      ? {
          operationId: "op",
          subsetId: subset.id,
          counts,
          added: 10,
          duplicates: 0,
          provenanceUpdated: 0,
        }
      : null,
});
const wrapper =
  (store = createStore()) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
function useJobs(datasetId: string) {
  useTrackSubsetJobs(datasetId);
  return useSubsetJobs(datasetId);
}
beforeEach(() => {
  sessionStorage.clear();
  mocks.refresh.mockReset();
  mocks.start
    .mockReset()
    .mockImplementation(async (_dataset, _kind, _request, id) => job(id));
  mocks.request
    .mockReset()
    .mockImplementation(async (_dataset, path) => job(path.slice(1)));
});
afterEach(cleanup);

it("reconnects after unmount and reload without submitting the capture again", async () => {
  const datasetId = crypto.randomUUID();
  const first = renderHook(() => useJobs(datasetId), { wrapper: wrapper() });
  let id = "";
  await act(async () => {
    id = await first.result.current.start(subset, {
      operationId: "op",
      snapshotId: "snapshot",
    });
  });
  await waitFor(() => expect(mocks.request).toHaveBeenCalled());
  expect(first.result.current.jobs[0].job.progress?.done).toBe(3);
  first.unmount();
  mocks.request.mockImplementation(async (_dataset, path) =>
    job(path.slice(1), "completed"),
  );
  const second = renderHook(() => useJobs(datasetId), { wrapper: wrapper() });
  await waitFor(() =>
    expect(second.result.current.jobs[0].job.state).toBe("completed"),
  );
  expect(second.result.current.jobs[0].job.id).toBe(id);
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(
    sessionStorage.getItem(`fiftyone:subset-jobs:${datasetId}`),
  ).not.toContain("snapshotId");
});

it("keeps the same visible operation when the server creates a retry attempt", async () => {
  const datasetId = crypto.randomUUID();
  mocks.start.mockImplementation(async (_dataset, _kind, _request, id) =>
    job(id, "failed"),
  );
  const current = renderHook(() => useJobs(datasetId), { wrapper: wrapper() });
  let original = "";
  await act(async () => {
    original = await current.result.current.start(subset, {});
  });
  mocks.request.mockResolvedValue(job("retry-attempt"));
  await act(async () => {
    await current.result.current.act(original, "retry");
  });
  expect(current.result.current.jobs).toHaveLength(1);
  expect(current.result.current.jobs[0].trackingId).toBe(original);
  expect(current.result.current.jobs[0].job.id).toBe("retry-attempt");
  expect(mocks.request).toHaveBeenCalledWith(datasetId, `/${original}`, {
    action: "retry",
  });
});

it("stops reconnecting when a persisted operation has expired", async () => {
  const datasetId = crypto.randomUUID();
  const view = renderHook(() => useJobs(datasetId), { wrapper: wrapper() });
  await act(async () => {
    await view.result.current.start(subset, {});
  });
  mocks.request.mockRejectedValue({ code: 404 });
  await waitFor(() =>
    expect(view.result.current.jobs[0].unavailable).toBe(true),
  );
  expect(view.result.current.jobs[0].job.state).toBe("failed");
  act(() => view.result.current.dismiss(view.result.current.jobs[0].job.id));
  expect(view.result.current.jobs).toHaveLength(0);
});

it("does not replace completed progress with a delayed start response", async () => {
  const datasetId = crypto.randomUUID();
  let accept: (value: SelectionJob<SubsetAddResult>) => void = () => {};
  mocks.start.mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  mocks.request.mockImplementation(async (_dataset, path) =>
    job(path.slice(1), "completed"),
  );
  const view = renderHook(() => useJobs(datasetId), { wrapper: wrapper() });
  let pending: Promise<string>;
  act(() => {
    pending = view.result.current.start(subset, {});
  });
  await waitFor(() =>
    expect(view.result.current.jobs[0].job.state).toBe("completed"),
  );
  const id = view.result.current.jobs[0].job.id;
  await act(async () => {
    accept(job(id, "requested"));
    await pending;
  });
  expect(view.result.current.jobs[0].job.state).toBe("completed");
});
