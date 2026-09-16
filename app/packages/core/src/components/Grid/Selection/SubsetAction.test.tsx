import { type GridSelectionActionContext } from "@fiftyone/multimodal/extensions/grid-selection";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { addToSubsetAction } from "./SubsetAction";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
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
  mocks.openBoundary.mockReset();
});

it("retries the captured members and operation after scope changes and partial failures", async () => {
  let previewAttempt = 0,
    applyAttempt = 0;
  mocks.request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase: string; operationId: string },
    ) => {
      if (!path) return { subsets: [{ id: "subset", name: "Review", counts }] };
      if (body?.phase === "prepare" && ++previewAttempt === 1)
        throw new Error("Preview interrupted");
      if (body?.phase === "apply" && ++applyAttempt === 1)
        throw new Error("Add interrupted");
      return {
        operationId: body?.operationId,
        subsetId: "subset",
        counts,
        added: 1,
        duplicates: 0,
        provenanceUpdated: 0,
      };
    },
  );
  const value = context();
  const view = render(<Host context={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByRole("dialog");
  expect(screen.getByText("Selected")).toBeTruthy();
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
  fireEvent.click(await screen.findByRole("radio", { name: /Review/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry preview" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add 1 member" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry add" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "Added 1 new member to Review",
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

it("prepares an all-results add from a snapshot token instead of member ids", async () => {
  mocks.request.mockImplementation(
    async (_dataset: string, path: string, body?: { operationId: string }) => {
      if (!path) return { subsets: [{ id: "subset", name: "Review", counts }] };
      return {
        operationId: body?.operationId,
        subsetId: "subset",
        counts: { ...counts, fullEpisodes: 120, episodes: 120 },
        added: 120,
        duplicates: 0,
        provenanceUpdated: 0,
      };
    },
  );
  const value = context({
    source: "results",
    resolve: vi.fn(async () => ({
      kind: "snapshot",
      snapshotId: "snap",
      counts: { ...counts, fullEpisodes: 120, episodes: 120 },
    })),
  });
  const view = render(<Host context={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByRole("dialog");
  expect(screen.getByText("All results")).toBeTruthy();
  expect(screen.getByText("120 full episodes")).toBeTruthy();
  fireEvent.click(await screen.findByRole("radio", { name: /Review/ }));
  await screen.findByRole("button", { name: "Add 120 members" });
  const prepare = mocks.request.mock.calls.find(
    (call) => call[2]?.phase === "prepare",
  );
  expect(prepare?.[2]).toMatchObject({ snapshotId: "snap" });
  expect(prepare?.[2].members).toBeUndefined();
  act(() => view.unmount());
});

it("creates a subset inline, previews it, and can open it after adding", async () => {
  mocks.request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase?: string; name?: string; operationId?: string },
    ) => {
      if (!path && body === undefined) return { subsets: [] };
      if (!path)
        return { id: "created", name: body?.name, counts: { ...counts } };
      return {
        operationId: body?.operationId,
        subsetId: "created",
        counts,
        added: 1,
        duplicates: 0,
        provenanceUpdated: 0,
      };
    },
  );
  const view = render(<Host context={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  await screen.findByText(/No saved subsets yet/);
  fireEvent.change(screen.getByLabelText("New subset name"), {
    target: { value: "  Night drives " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(
    (await screen.findByRole("radio", { name: /Night drives/ })).getAttribute(
      "aria-checked",
    ),
  ).toBe("true");
  expect(mocks.request).toHaveBeenCalledWith("dataset", "", {
    name: "Night drives",
  });
  fireEvent.click(await screen.findByRole("button", { name: "Add 1 member" }));
  await screen.findByRole("status");
  fireEvent.click(screen.getByRole("button", { name: "Open subset" }));
  expect(mocks.openBoundary).toHaveBeenCalledWith({
    subsetId: "created",
    subsetScope: "episodes",
  });
  act(() => view.unmount());
});

it("saves a new subset instead of changing the open one", async () => {
  mocks.request.mockImplementation(
    async (
      _dataset: string,
      path: string,
      body?: { phase?: string; name?: string; operationId?: string },
    ) => {
      if (!path && body === undefined)
        return { subsets: [{ id: "open", name: "Hard negatives", counts }] };
      if (!path)
        return { id: "created", name: body?.name, counts: { ...counts } };
      return {
        operationId: body?.operationId,
        subsetId: "created",
        counts,
        added: 1,
        duplicates: 0,
        provenanceUpdated: 0,
      };
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
  expect(screen.queryByRole("radiogroup")).toBeNull();
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
  expect(screen.getByText("Saved 1 member as Night drives.")).toBeTruthy();
  expect(
    mocks.request.mock.calls.map((call) => [
      call[1],
      call[2]?.phase ?? call[2]?.name,
    ]),
  ).toEqual([
    ["", undefined],
    ["", "Night drives"],
    ["/add", "prepare"],
    ["/add", "apply"],
  ]);
  act(() => view.unmount());
});

it("shows an already-in-subset state instead of an add button when nothing is new", async () => {
  mocks.request.mockImplementation(async (_dataset: string, path: string) => {
    if (!path) return { subsets: [{ id: "subset", name: "Review", counts }] };
    return {
      operationId: "op",
      subsetId: "subset",
      counts,
      added: 0,
      duplicates: 1,
      provenanceUpdated: 0,
    };
  });
  const view = render(<Host context={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add to subset" }));
  fireEvent.click(await screen.findByRole("radio", { name: /Review/ }));
  const button = await screen.findByRole("button", {
    name: "Already in subset",
  });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("already in subset")).toBeTruthy();
  act(() => view.unmount());
});
