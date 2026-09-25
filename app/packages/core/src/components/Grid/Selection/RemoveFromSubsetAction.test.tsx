import {
  gridActionDisabledReason,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { removeFromSubsetAction } from "./RemoveFromSubsetAction";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  invalidate: vi.fn(),
  deselect: vi.fn(),
  deselectSnapshots: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@fiftyone/state", () => ({
  useSelectionSubsetDisabledReason: () => null,
  useRefresh: () => mocks.refresh,
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  removeSubsetMembers: mocks.remove,
  useInvalidateSelectionScope: () => mocks.invalidate,
  useGridSelectionDataset: () => ({ domainId: "dataset" }),
  useSelectionBucketCommands: () => ({
    removeMembersEverywhere: mocks.deselect,
    removeSnapshotsEverywhere: mocks.deselectSnapshots,
  }),
}));
vi.mock("./useSubsetScope", () => ({
  useSavedSubset: (_datasetId: string, subsetId: string) => ({
    subset: { id: subsetId, name: "Animals" },
    loading: false,
    error: null,
  }),
}));

function context(
  overrides: Partial<GridSelectionActionContext> = {},
): GridSelectionActionContext {
  return {
    datasetId: "dataset",
    mediaType: "image",
    source: "explicit",
    counts: {
      episodes: 1,
      fullEpisodes: 1,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
    },
    groups: [],
    loading: false,
    error: null,
    boundary: { subsetId: "active", subsetScope: "episodes" },
    unit: { one: "sample", many: "samples", temporal: false },
    conversion: null,
    view: [],
    resolve: vi.fn(async () => ({
      kind: "members",
      members: [{ episodeId: "sample", kind: "episode" }],
    })),
    ...overrides,
  };
}

function Host({ value }: { value: GridSelectionActionContext }) {
  return (
    <removeFromSubsetAction.Component
      context={value}
      disabledReason={gridActionDisabledReason(removeFromSubsetAction, value)}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.remove
    .mockReset()
    .mockResolvedValue({ subsetId: "active", removed: 1 });
  mocks.invalidate.mockReset();
  mocks.deselect.mockReset();
  mocks.deselectSnapshots.mockReset();
  mocks.refresh.mockReset();
});
afterEach(cleanup);

it("only offers removal inside a subset and requires selected members", () => {
  const view = render(<Host value={context({ boundary: {} })} />);
  expect(
    screen.queryByRole("button", { name: "Remove from subset" }),
  ).toBeNull();
  view.rerender(<Host value={context({ source: "results" })} />);
  const button = screen.getByRole("button", { name: "Remove from subset" });
  expect(button.hasAttribute("disabled")).toBe(true);
  fireEvent.click(button);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("confirms removal, deselects its captured members, and shows no success message", async () => {
  render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  const heading = await screen.findByRole("heading", {
    name: "Remove from Animals",
  });
  expect(heading.querySelector("i")?.textContent).toBe("Animals");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.deselect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.remove).toHaveBeenCalledWith("dataset", "active", {
    kind: "members",
    members: [{ episodeId: "sample", kind: "episode" }],
  });
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.deselect).toHaveBeenCalledWith([
    { episodeId: "sample", kind: "episode" },
  ]);
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps the original capture for retry after selection changes", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("Connection interrupted"));
  const original = context();
  const view = render(<Host value={original} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Remove selected" }),
  );
  await screen.findByRole("alert");
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(mocks.deselect).not.toHaveBeenCalled();
  const later = context({
    source: "results",
    resolve: vi.fn(async () => ({
      kind: "members",
      members: [{ episodeId: "later", kind: "episode" }],
    })),
  });
  view.rerender(<Host value={later} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.remove.mock.calls[0]).toEqual(mocks.remove.mock.calls[1]);
  expect(original.resolve).toHaveBeenCalledOnce();
  expect(later.resolve).not.toHaveBeenCalled();
});

it("does not reuse a failed capture after switching subsets", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("Connection interrupted"));
  const view = render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Remove selected" }),
  );
  await screen.findByRole("alert");
  const next = context({
    boundary: { subsetId: "other", subsetScope: "episodes" },
  });
  view.rerender(<Host value={next} />);
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Remove selected" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.remove).toHaveBeenLastCalledWith(
    "dataset",
    "other",
    expect.anything(),
  );
  expect(next.resolve).toHaveBeenCalledOnce();
});

it("disables removal while the request is in flight", async () => {
  let finish: (value: { removed: number }) => void = vi.fn();
  mocks.remove.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Remove selected" }),
  );
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
  const busy = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Removing…",
  });
  expect(busy.hasAttribute("disabled")).toBe(true);
  fireEvent.click(busy);
  finish({ removed: 1 });
  expect(mocks.deselect).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.remove).toHaveBeenCalledOnce();
});

it("cancels without removing members, deselecting, or saving a preference", async () => {
  render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "Don't ask for confirmation again",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.deselect).not.toHaveBeenCalled();
  expect(
    localStorage.getItem("fiftyone.subsets.skipRemoveConfirmation.v1"),
  ).toBeNull();
});

it("remembers removal confirmation separately from subset deletion", async () => {
  localStorage.setItem("fiftyone.subsets.skipDeleteConfirmation.v1", "true");
  const view = render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "Don't ask for confirmation again",
    }),
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    localStorage.getItem("fiftyone.subsets.skipRemoveConfirmation.v1"),
  ).toBe("true");
  view.unmount();
  render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  await waitFor(() => expect(mocks.deselect).toHaveBeenCalledTimes(2));
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps selection and offers a retry when skipped confirmation removal fails", async () => {
  localStorage.setItem("fiftyone.subsets.skipRemoveConfirmation.v1", "true");
  mocks.remove.mockRejectedValueOnce(new Error("Connection interrupted"));
  render(<Host value={context()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  await screen.findByRole("alert");
  expect(mocks.deselect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.deselect).toHaveBeenCalledOnce();
});

it("removes the confirmed group snapshot and leaves later captures alone", async () => {
  const counts = {
    episodes: 3,
    fullEpisodes: 3,
    segments: 0,
    segmentEpisodes: 0,
    unavailable: 0,
    groups: 1,
  };
  const scope = { kind: "snapshot" as const, snapshotId: "union", counts };
  const value = context({
    counts,
    groups: [
      {
        episodeId: "rep",
        members: [],
        group: { label: "scene", size: 3, snapshotId: "original" },
      },
    ],
    resolve: vi.fn(async () => scope),
  });
  const host = render(<Host value={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove from subset" }));
  await screen.findByRole("heading", { name: "Remove from Animals" });
  host.rerender(
    <Host
      value={context({
        ...value,
        groups: [
          {
            episodeId: "rep",
            members: [],
            group: { label: "scene", size: 4, snapshotId: "later" },
          },
        ],
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.remove).toHaveBeenCalledWith("dataset", "active", scope);
  expect(mocks.deselectSnapshots).toHaveBeenCalledWith(["original"]);
});
