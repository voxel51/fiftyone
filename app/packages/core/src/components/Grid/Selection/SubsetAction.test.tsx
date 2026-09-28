import {
  gridActionDisabledReason,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Provider } from "jotai";
import { addToSubsetAction } from "./SubsetAction";
import SubsetJobs from "./SubsetJobs";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  combine: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  openBoundary: vi.fn(),
  openDomain: vi.fn(),
  setView: vi.fn(),
  start: vi.fn(),
  job: vi.fn(),
  permission: null as string | null,
}));
vi.mock("@fiftyone/state", () => ({
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useSelectionSubsetDisabledReason: () => mocks.permission,
  useClearTemporalTagConstraint: () => vi.fn(),
  useGridViewScope: () => ({ refresh: 0 }),
  useSetView: () => mocks.setView,
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  ...(await import("@fiftyone/state/src/selection/fold")),
  ...(await import("@fiftyone/state/src/selection/jobs")),
  useGridSelectionBoundary: () => [{}, mocks.openBoundary],
  useOpenSelectionBoundary: () => mocks.openDomain,
  useGridSelectionDataset: () => ({
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "video",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
  }),
  subsetRequest: mocks.request,
  combineSelectionCaptures: mocks.combine,
  listSubsets: mocks.list,
  getSubset: mocks.get,
  scopeBody: (scope: {
    kind: string;
    members?: unknown;
    snapshotId?: string;
  }) =>
    scope.kind === "members"
      ? { members: scope.members }
      : { snapshotId: scope.snapshotId },
}));

vi.mock("@fiftyone/state/src/selection/client", () => ({
  startSelectionJob: mocks.start,
  selectionJobRequest: mocks.job,
}));

const counts = {
  episodes: 1,
  fullEpisodes: 1,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};
const original = [{ episodeId: "original", kind: "episode" as const }];
const review = {
  id: "subset",
  name: "Review",
  counts,
  memberCount: counts.fullEpisodes,
  memberCounts: counts,
};
type Body = { name?: string; description?: string; operationId?: string };
const added = (body: Body | undefined, subsetId = "subset", extra = {}) => ({
  operationId: body?.operationId,
  subsetId,
  counts,
  added: 1,
  duplicates: 0,
  provenanceUpdated: 0,
  ...extra,
});
const completed = (
  request: Body,
  id: string,
  subsetId = "subset",
  extra = {},
) => ({
  id,
  kind: "add",
  state: "completed",
  cancelRequested: false,
  progress: null,
  error: null,
  result: added(request, subsetId, extra),
});

function context(
  overrides: Partial<GridSelectionActionContext> = {},
): GridSelectionActionContext {
  return {
    datasetId: "dataset",
    mediaType: "video",
    source: "explicit",
    counts,
    groups: [{ episodeId: "original", members: original }],
    loading: false,
    error: null,
    boundary: {},
    unit: { one: "episode", many: "episodes", temporal: true },
    conversion: null,
    view: [],
    resolve: vi.fn(async () => ({ kind: "members", members: original })),
    ...overrides,
  };
}

function Host({
  context: value,
  track = false,
}: {
  context: GridSelectionActionContext;
  track?: boolean;
}) {
  return (
    <Provider>
      <addToSubsetAction.Component context={value} disabledReason={null} />
      {track && <SubsetJobs datasetId={value.datasetId} />}
    </Provider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.permission = null;
  mocks.start
    .mockReset()
    .mockImplementation(async (_dataset, _kind, request, id) =>
      completed(request, id, request.subsetId),
    );
  mocks.job.mockReset();
  mocks.request.mockReset();
  mocks.combine.mockReset();
  mocks.list.mockReset().mockResolvedValue({
    subsets: [review],
    total: 1,
    count: 1,
  });
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.openBoundary.mockReset();
  mocks.openDomain.mockReset();
  mocks.setView.mockReset();
});
afterEach(cleanup);

it("creates a subset of exact patches with its captured view", async () => {
  const stages = [
    {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "ground_truth"]],
    },
  ];
  const value = context({
    mediaType: "image",
    conversion: "patches",
    unit: { one: "patch", many: "patches", temporal: false },
    view: stages,
  });
  expect(gridActionDisabledReason(addToSubsetAction, value)).toBeNull();
  for (const conversion of ["frames", "clips"] as const)
    expect(
      gridActionDisabledReason(addToSubsetAction, { ...value, conversion }),
    ).toBeNull();
  mocks.list.mockResolvedValue({ subsets: [], total: 0, count: 0 });
  mocks.request.mockResolvedValue({
    id: "created",
    name: "Birds",
    counts,
    view: stages,
  });
  render(<Host context={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
  await screen.findByText("No saved subsets yet");
  expect(mocks.list).toHaveBeenLastCalledWith(
    "dataset",
    expect.objectContaining({ view: stages }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New subset" }));
  await screen.findByText("New subset from 1 selected patch");
  fireEvent.change(screen.getByLabelText("New subset name"), {
    target: { value: "Birds" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
  await screen.findByText("1 member added to Birds");
  expect(mocks.request).toHaveBeenCalledWith("dataset", "", {
    name: "Birds",
    description: undefined,
    view: stages,
  });
  expect(mocks.start.mock.calls[0][2]).toMatchObject({
    subsetId: "created",
    members: original,
    view: stages,
  });
  fireEvent.click(screen.getByRole("button", { name: "Open subset" }));
  expect(mocks.openDomain).toHaveBeenCalledWith(
    expect.stringContaining("ToPatches"),
    {
      subsetId: "created",
      subsetScope: "episodes",
    },
  );
  expect(mocks.setView).toHaveBeenCalledWith(stages);
});

it("keeps the captured scope and retries the same background operation", async () => {
  mocks.start.mockImplementation(async (_dataset, _kind, _request, id) => ({
    id,
    kind: "add",
    state: "failed",
    progress: { phase: "applying", done: 1, total: 2 },
    result: null,
    error: "Connection interrupted",
    cancelRequested: false,
  }));
  mocks.job.mockResolvedValue(completed({}, "retried"));
  const value = context();
  const view = render(<Host context={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
  await screen.findByText("Add 1 selected episode to subset");
  expect(mocks.list).toHaveBeenLastCalledWith(
    "dataset",
    expect.objectContaining({ view: [] }),
  );
  view.rerender(
    <Host
      context={context({
        source: "results",
        resolve: async () => ({
          kind: "snapshot",
          snapshotId: "later",
          counts,
        }),
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Review/ }));
  await screen.findByText(/Couldn't finish adding/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("1 member added to Review");
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.start.mock.calls[0][2].members).toEqual(original);
  expect(mocks.start.mock.calls[0][2].snapshotId).toBeUndefined();
  expect(mocks.job.mock.calls[0][2]).toEqual({ action: "retry" });
  expect(value.resolve).toHaveBeenCalledOnce();
});

it("adds all results from a snapshot token instead of member ids", async () => {
  const big = { ...counts, fullEpisodes: 120, episodes: 120 };
  mocks.start.mockImplementation(async (_dataset, _kind, request, id) =>
    completed(request, id, "subset", { counts: big, added: 120 }),
  );
  const value = context({
    source: "results",
    resolve: vi.fn(async () => ({
      kind: "snapshot",
      snapshotId: "snap",
      counts: big,
    })),
  });
  const view = render(<Host context={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByText("Add all 120 episodes in view to subset");
  fireEvent.click(await screen.findByRole("button", { name: /^Review/ }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "120 members added to Review",
    ),
  );
  const prepare = mocks.start.mock.calls[0];
  expect(prepare?.[2]).toMatchObject({ snapshotId: "snap" });
  expect(prepare?.[2].members).toBeUndefined();
  act(() => view.unmount());
});

it("creates a subset with a description from the form and can open it", async () => {
  mocks.list.mockResolvedValue({ subsets: [], total: 0, count: 0 });
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: Body) => {
      if (!path && body === undefined) return { subsets: [] };
      if (!path)
        return {
          id: "created",
          name: body?.name,
          description: body?.description,
          counts,
        };
      return added(body, "created");
    },
  );
  const view = render(<Host context={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByText("No saved subsets yet");
  fireEvent.click(screen.getByRole("button", { name: "New subset" }));
  await screen.findByText("New subset from 1 selected episode");
  fireEvent.change(screen.getByLabelText("New subset name"), {
    target: { value: "  Night drives " },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: " After dusk " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
  await screen.findByRole("status");
  expect(screen.getByRole("status").textContent).toContain(
    "1 member added to Night drives",
  );
  expect(mocks.request).toHaveBeenCalledWith("dataset", "", {
    name: "Night drives",
    description: "After dusk",
    view: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Open subset" }));
  expect(mocks.openBoundary).toHaveBeenCalledWith({
    subsetId: "created",
    subsetScope: "episodes",
  });
  act(() => view.unmount());
});

it("saves a new subset instead of changing the open one", async () => {
  mocks.get.mockResolvedValue({ id: "open", name: "Hard negatives", counts });
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: Body) => {
      if (!path && body === undefined)
        return { subsets: [{ id: "open", name: "Hard negatives", counts }] };
      if (!path) return { id: "created", name: body?.name, counts };
      return added(body, "created");
    },
  );
  const view = render(
    <Host
      context={context({
        boundary: { subsetId: "open", subsetScope: "episodes" },
      })}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Save as new subset" }),
  );
  await screen.findByLabelText("New subset name");
  expect(screen.queryByText(/is a saved selection/)).toBeNull();
  expect(screen.queryByRole("button", { name: "New subset" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Create subset" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("New subset name"), {
    target: { value: "Night drives" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
  await screen.findByRole("status");
  expect(screen.getByRole("status").textContent).toContain(
    "1 member added to Night drives",
  );
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.start.mock.calls[0][2].subsetId).toBe("created");
  act(() => view.unmount());
});

it("says so when everything was already in the subset", async () => {
  mocks.start.mockImplementation(async (_dataset, _kind, request, id) =>
    completed(request, id, "subset", { added: 0, duplicates: 1 }),
  );
  const view = render(<Host context={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Review/ }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "already in the subset",
    ),
  );
  act(() => view.unmount());
});

it("disables subset writes when the dataset cannot be edited", async () => {
  mocks.permission = "You need edit permission";
  render(<Host context={context()} />);
  expect(
    screen
      .getByRole("button", { name: "Add to subset" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("opens a closable panel while a large result scope is being captured", async () => {
  const value = context({
    source: "results",
    counts: null,
    resolve: () => new Promise(() => {}),
  });
  render(<Host context={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
  await screen.findByText("Freezing scope");
  expect(
    screen.getByRole("button", { name: /^Review/ }).hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps a save reachable after closing the panel and stops without promising rollback", async () => {
  const running = {
    id: "",
    kind: "add",
    state: "running",
    progress: { phase: "applying", done: 3, total: 10, added: 3 },
    result: null,
    error: null,
    cancelRequested: false,
  };
  mocks.start.mockImplementation(async (_dataset, _kind, _request, id) => ({
    ...running,
    id,
  }));
  mocks.job.mockImplementation(async (_dataset, path, body) => ({
    ...running,
    id: path.slice(1),
    state: body?.action === "cancel" ? "canceled" : "running",
  }));
  render(<Host context={context()} track />);
  fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
  await screen.findByText("Add 1 selected episode to subset");
  fireEvent.click(screen.getByRole("button", { name: /^Review/ }));
  await screen.findByText("3 of 10 members");
  fireEvent.click(screen.getByRole("button", { name: "Keep working" }));
  fireEvent.click(screen.getByRole("button", { name: "Saving: Review" }));
  await screen.findByText("3 of 10 members");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await screen.findByText(/Members already saved will stay in Review/);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await screen.findByText("Stopped adding to Review");
  expect(
    mocks.job.mock.calls.some((call) => call[2]?.action === "cancel"),
  ).toBe(true);
  expect(mocks.start).toHaveBeenCalledOnce();
});

it("saves a frozen all-slices scope with an optional opening slice", async () => {
  const expanded = {
    kind: "snapshot",
    snapshotId: "siblings",
    counts: { ...counts, episodes: 2, fullEpisodes: 2 },
  };
  mocks.combine.mockResolvedValue(expanded);
  mocks.request.mockResolvedValue({ ...review, id: "created", name: "Stereo" });
  render(
    <Host
      context={context({
        mediaType: "group",
        preferredGroupSlice: "left",
        unit: { one: "sample", many: "samples", temporal: false },
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to subset" }));
  fireEvent.click(
    await screen.findByRole("radio", { name: "All slices of these groups" }),
  );
  await screen.findByText("Add 2 selected samples to subset");
  fireEvent.click(screen.getByRole("button", { name: "New subset" }));
  fireEvent.change(screen.getByLabelText("New subset name"), {
    target: { value: "Stereo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create subset" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  expect(mocks.request).toHaveBeenCalledWith(
    "dataset",
    "",
    expect.objectContaining({ preferredGroupSlice: "left" }),
  );
  expect(mocks.start.mock.calls[0][2]).toMatchObject({
    snapshotId: "siblings",
    subsetId: "created",
  });
  expect(mocks.combine).toHaveBeenCalledOnce();
});
