import { type GridSelectionActionContext } from "@fiftyone/multimodal/extensions/grid-selection";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addToSubsetAction } from "./SubsetAction";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  openBoundary: vi.fn(),
}));
vi.mock("@fiftyone/state", () => ({
  useClearTemporalTagConstraint: () => vi.fn(),
  useGridViewScope: () => ({ refresh: 0 }),
  useSetView: () => vi.fn(),
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  ...(await import("@fiftyone/state/src/selection/fold")),
  useGridSelectionBoundary: () => [{}, mocks.openBoundary],
  useGridSelectionDataset: () => ({
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "video",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
  }),
  subsetRequest: mocks.request,
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

const counts = {
  episodes: 1,
  fullEpisodes: 1,
  segments: 0,
  segmentEpisodes: 0,
  unavailable: 0,
};
const original = [{ episodeId: "original", kind: "episode" as const }];
const review = { id: "subset", name: "Review", counts };
type Body = {
  phase?: string;
  name?: string;
  description?: string;
  operationId?: string;
};
const added = (body: Body | undefined, subsetId = "subset", extra = {}) => ({
  operationId: body?.operationId,
  subsetId,
  counts,
  added: 1,
  duplicates: 0,
  provenanceUpdated: 0,
  ...extra,
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

function Host({ context: value }: { context: GridSelectionActionContext }) {
  return <addToSubsetAction.Component context={value} disabledReason={null} />;
}

beforeEach(() => {
  mocks.request.mockReset();
  mocks.list.mockReset().mockResolvedValue({
    subsets: [review],
    total: 1,
    count: 1,
  });
  mocks.get.mockReset().mockResolvedValue(null);
  mocks.openBoundary.mockReset();
});
afterEach(cleanup);

it("adds to a subset with one press and resumes after partial failures", async () => {
  let prepareAttempt = 0,
    applyAttempt = 0;
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: Body) => {
      if (!path) return { subsets: [review] };
      if (body?.phase === "prepare" && ++prepareAttempt === 1)
        throw new Error("Preview interrupted");
      if (body?.phase === "apply" && ++applyAttempt === 1)
        throw new Error("Add interrupted");
      return added(body);
    },
  );
  const value = context();
  const view = render(<Host context={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByText("Add 1 selected episode to subset");
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
  fireEvent.click(await screen.findByRole("button", { name: /^Review/ }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Add interrupted"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Added 1 episode to Review",
    ),
  );
  const prepares = mocks.request.mock.calls.filter(
    (call) => call[2]?.phase === "prepare",
  );
  const applies = mocks.request.mock.calls.filter(
    (call) => call[2]?.phase === "apply",
  );
  expect(prepares).toHaveLength(2);
  expect(applies).toHaveLength(2);
  expect(prepares[0][2]).toEqual(prepares[1][2]);
  expect(prepares[0][2].members).toEqual(original);
  expect(prepares[0][2].snapshotId).toBeUndefined();
  expect(applies[0][2]).toEqual(applies[1][2]);
  expect(applies[0][2].operationId).toBe(prepares[0][2].operationId);
  expect(value.resolve).toHaveBeenCalledOnce();
  act(() => view.unmount());
});

it("adds all results from a snapshot token instead of member ids", async () => {
  const big = { ...counts, fullEpisodes: 120, episodes: 120 };
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: Body) =>
      !path
        ? { subsets: [review] }
        : added(body, "subset", { counts: big, added: 120 }),
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
      "Added 120 episodes to Review",
    ),
  );
  const prepare = mocks.request.mock.calls.find(
    (call) => call[2]?.phase === "prepare",
  );
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
    "Saved 1 episode as Night drives",
  );
  expect(mocks.request).toHaveBeenCalledWith("dataset", "", {
    name: "Night drives",
    description: "After dusk",
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
  await screen.findByText(/Hard negatives is a saved selection/);
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
    "Saved 1 episode as Night drives",
  );
  // The subset list reloads after the create; the writes happen once each.
  expect(
    mocks.request.mock.calls
      .filter((call) => call[2] !== undefined)
      .map((call) => [call[1], call[2]?.phase ?? call[2]?.name]),
  ).toEqual([
    ["", "Night drives"],
    ["/add", "prepare"],
    ["/add", "apply"],
  ]);
  act(() => view.unmount());
});

it("says so when everything was already in the subset", async () => {
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: Body) =>
      !path
        ? { subsets: [review] }
        : added(body, "subset", { added: 0, duplicates: 1 }),
  );
  const view = render(<Host context={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Review/ }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "already in Review",
    ),
  );
  act(() => view.unmount());
});
