import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tagSelectionAction } from "./TagAction";
import { useRegisterSelectionActions } from "./useRegisterSelectionActions";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  permission: null as string | null,
}));
vi.mock("@fiftyone/state", () => ({
  useRefresh: () => mocks.refresh,
  useSelectionTagDisabledReason: () => mocks.permission,
  useClearTemporalTagConstraint: () => vi.fn(),
  useGridViewScope: () => ({ refresh: 0 }),
  useSetView: () => vi.fn(),
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  ...(await import("@fiftyone/state/src/selection/fold")),
  useGridSelectionBoundary: () => [{}, vi.fn()],
  useGridSelectionDataset: () => ({
    datasetId: "dataset",
    domainId: "dataset",
    mediaType: "multimodal",
    conversion: null,
    unit: { one: "episode", many: "episodes", temporal: true },
    enabled: true,
  }),
  selectionTagsRequest: mocks.request,
  subsetRequest: vi.fn(async () => ({ subsets: [] })),
  scopeBody: (scope: {
    kind: string;
    members?: unknown;
    snapshotId?: string;
  }) =>
    scope.kind === "members"
      ? { members: scope.members }
      : { snapshotId: scope.snapshotId },
}));

const unapplied = { tags: ["review"], applied: {}, targets: 1, labels: null };
const applied = {
  tags: ["review"],
  applied: { review: 1 },
  targets: 1,
  labels: null,
};

beforeEach(() => {
  mocks.permission = null;
  mocks.request.mockReset().mockResolvedValue(unapplied);
  mocks.refresh.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const members = [
  {
    episodeId: "episode",
    kind: "segment" as const,
    range: {
      start: "9007199254740993",
      end: "9007199254741003",
      timebase: "timestamp-ns",
      streams: ["camera"],
      provenance: [],
    },
  },
];
const explicit = { kind: "members" as const, members };

function context(): GridSelectionActionContext {
  return {
    datasetId: "dataset",
    mediaType: "multimodal",
    source: "explicit",
    counts: {
      episodes: 1,
      fullEpisodes: 0,
      segments: 1,
      segmentEpisodes: 1,
      unavailable: 0,
    },
    groups: [{ episodeId: "episode", members }],
    loading: false,
    error: null,
    boundary: {},
    unit: { one: "episode", many: "episodes", temporal: true },
    conversion: null,
    view: [],
    resolve: vi.fn(async () => explicit),
  };
}
function Host({ value }: { value: GridSelectionActionContext }) {
  useRegisterSelectionActions();
  const action = useGridSelectionActions().find(
    (item) => item.id === tagSelectionAction.id,
  );
  return (
    action && (
      <action.Component
        context={value}
        disabledReason={gridActionDisabledReason(action, value)}
      />
    )
  );
}
const tagButton = () =>
  screen.getByRole("button", { name: "Tag", exact: true });
const tagRow = () =>
  screen.getByRole("button", { name: "review", exact: true });

it("toggles a tag in place, keeping frozen membership through scope changes and retries", async () => {
  const value = context();
  const rendered = render(<Host value={value} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Tag", exact: true }),
  );
  await screen.findByText(/^Tag selected/);
  rendered.rerender(
    <Host
      value={{
        ...value,
        source: "results",
        resolve: vi.fn(async () => ({
          kind: "snapshot" as const,
          snapshotId: "other",
          counts: value.counts,
        })),
      }}
    />,
  );
  await screen.findByRole("button", { name: "review", exact: true });
  mocks.request.mockRejectedValueOnce(new Error("Connection interrupted"));
  fireEvent.click(tagRow());
  await screen.findByRole("alert");
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(tagRow());
  await waitFor(() =>
    expect(tagRow().getAttribute("aria-pressed")).toBe("true"),
  );
  expect(mocks.request.mock.calls[1]).toEqual(mocks.request.mock.calls[2]);
  expect(mocks.request.mock.calls[2]).toEqual([
    "dataset",
    explicit,
    { change: { tag: "review", add: true }, target: "members", view: [] },
  ]);
  expect(value.resolve).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  rendered.unmount();
});

it("removes a tag every target already carries, acting on a server snapshot for all results", async () => {
  mocks.request.mockResolvedValue(applied);
  const snapshot = {
    kind: "snapshot" as const,
    snapshotId: "snap",
    counts: context().counts,
  };
  const value = {
    ...context(),
    source: "results" as const,
    resolve: vi.fn(async () => snapshot),
  };
  const rendered = render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByText(/^Tag all .* in view$/);
  const row = await screen.findByRole("button", {
    name: "review",
    exact: true,
  });
  expect(mocks.request).toHaveBeenLastCalledWith("dataset", snapshot, {
    target: "members",
    view: [],
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  mocks.request.mockResolvedValueOnce(unapplied);
  fireEvent.click(row);
  await waitFor(() =>
    expect(tagRow().getAttribute("aria-pressed")).toBe("false"),
  );
  expect(mocks.request).toHaveBeenLastCalledWith("dataset", snapshot, {
    change: { tag: "review", add: false },
    target: "members",
    view: [],
  });
  rendered.unmount();
});

it("offers to create an unknown tag and applies it on Enter", async () => {
  const rendered = render(<Host value={context()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByRole("button", { name: "review", exact: true });
  const input = screen.getByLabelText("Create or find tag");
  fireEvent.change(input, { target: { value: "  night " } });
  expect(screen.getByText("Create “night”")).toBeTruthy();
  mocks.request.mockResolvedValueOnce({
    ...unapplied,
    tags: ["night", "review"],
    applied: { night: 1 },
  });
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("button", { name: "night", exact: true });
  expect(mocks.request).toHaveBeenLastCalledWith("dataset", explicit, {
    change: { tag: "night", add: true },
    target: "members",
    view: [],
  });
  expect(
    (screen.getByLabelText("Create or find tag") as HTMLInputElement).value,
  ).toBe("");
  rendered.unmount();
});

it("lets grouped datasets choose between the active slice and every slice", async () => {
  const full = [{ episodeId: "episode", kind: "episode" as const }];
  const value = {
    ...context(),
    mediaType: "group",
    counts: {
      episodes: 1,
      fullEpisodes: 1,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
    },
    groups: [{ episodeId: "episode", members: full }],
    unit: { one: "sample", many: "samples", temporal: false },
    resolve: vi.fn(async () => ({ kind: "members" as const, members: full })),
  };
  const rendered = render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByRole("button", { name: "review", exact: true });
  fireEvent.click(screen.getByRole("radio", { name: "All slices" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      { kind: "members", members: full },
      { target: "members", view: [], groups: "all" },
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "review", exact: true }),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      { kind: "members", members: full },
      {
        change: { tag: "review", add: true },
        target: "members",
        view: [],
        groups: "all",
      },
    ),
  );
  rendered.unmount();
});

it("enforces empty, loading, error, missing-parent, timebase, and permission restrictions", async () => {
  const value = context();
  expect(
    gridActionDisabledReason(tagSelectionAction, { ...value, loading: true }),
  ).toBeTruthy();
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...value,
      error: "Unavailable",
    }),
  ).toBe("Unavailable");
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...value,
      counts: { ...value.counts, episodes: 0 },
    }),
  ).toBeTruthy();
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...value,
      counts: { ...value.counts, unavailable: 1 },
    }),
  ).toContain("unavailable");
  const member = value.groups[0].members[0];
  if (member.kind !== "segment") throw new Error("Expected segment fixture");
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...value,
      groups: [
        {
          episodeId: "episode",
          members: [
            { ...member, range: { ...member.range, timebase: "unknown" } },
          ],
        },
      ],
    }),
  ).toContain("timebase");
  mocks.permission = "No tagging permission";
  const rendered = render(<Host value={value} />);
  expect(
    (await screen.findByRole("button", { name: "Tag" })).hasAttribute(
      "disabled",
    ),
  ).toBe(true);
  mocks.permission = null;
  rendered.rerender(<Host value={value} />);
  fireEvent.click(tagButton());
  await screen.findByRole("button", { name: "review", exact: true });
  mocks.permission = "Permission revoked";
  rendered.rerender(<Host value={value} />);
  expect(tagRow().hasAttribute("disabled")).toBe(true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  rendered.unmount();
});

it("keeps shared registrations alive while another grid is mounted", async () => {
  const first = render(<Host value={context()} />);
  const second = render(<Host value={context()} />);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "Tag", exact: true }),
    ).toHaveLength(2),
  );
  first.unmount();
  expect(
    screen.getAllByRole("button", { name: "Tag", exact: true }),
  ).toHaveLength(1);
  second.unmount();
});

it("tags labels only for whole episodes and handles an empty label scope", async () => {
  const value = context();
  const rendered = render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByRole("button", { name: "review", exact: true });
  expect(
    screen.getByRole("radio", { name: "Labels" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(tagButton());
  const full = [{ episodeId: "episode", kind: "episode" as const }];
  rendered.rerender(
    <Host
      value={{
        ...value,
        counts: { ...value.counts, fullEpisodes: 1, segments: 0 },
        groups: [{ episodeId: "episode", members: full }],
        resolve: async () => ({ kind: "members", members: full }),
      }}
    />,
  );
  fireEvent.click(tagButton());
  await screen.findByRole("button", { name: "review", exact: true });
  mocks.request.mockResolvedValueOnce({ ...unapplied, targets: 0, labels: 0 });
  fireEvent.click(screen.getByRole("radio", { name: "Labels" }));
  await screen.findByText("No labels in these episodes.");
  expect(tagRow().hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Episodes" }));
  await waitFor(() => expect(tagRow().hasAttribute("disabled")).toBe(false));
  mocks.request.mockResolvedValueOnce({ ...unapplied, targets: 2, labels: 2 });
  fireEvent.click(screen.getByRole("radio", { name: "Labels" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      { kind: "members", members: full },
      { target: "labels", view: [] },
    ),
  );
  await waitFor(() => expect(tagRow().hasAttribute("disabled")).toBe(false));
  fireEvent.click(tagRow());
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      { kind: "members", members: full },
      { change: { tag: "review", add: true }, target: "labels", view: [] },
    ),
  );
  rendered.unmount();
});
