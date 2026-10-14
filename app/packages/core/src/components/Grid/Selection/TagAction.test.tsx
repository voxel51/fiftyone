import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { selectionUnit } from "@fiftyone/state/src/selection/model";
import { NetworkError } from "@fiftyone/utilities";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tagSelectionAction } from "./TagAction";
import { useRegisterSelectionActions } from "./useRegisterSelectionActions";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  combine: vi.fn(),
  refresh: vi.fn(),
  permission: null as string | null,
}));
vi.mock("@fiftyone/state", () => ({
  useSetGroupSlice: () => vi.fn(),
  useGroupSlices: () => ["left", "right"],
  useRefresh: () => mocks.refresh,
  useSelectionTagDisabledReason: () => mocks.permission,
  useClearGridViewConstraints: () => vi.fn(),
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
  combineSelectionCaptures: mocks.combine,
  subsetRequest: vi.fn(async () => ({ subsets: [] })),
  listSubsets: vi.fn(async () => ({ subsets: [], total: 0, count: 0 })),
  getSubset: vi.fn(async () => null),
  scopeBody: (scope: {
    kind: string;
    members?: unknown;
    snapshotId?: string;
  }) =>
    scope.kind === "members"
      ? { members: scope.members }
      : { snapshotId: scope.snapshotId },
}));

vi.mock("./SimilarityAction", () => ({
  similaritySelectionAction: {
    id: "fiftyone:similarity",
    order: 4,
    placement: "more",
    label: "Find Similar",
    supports: () => true,
    scope: "explicit",
    memberKinds: ["episode"],
    Component: () => null,
  },
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
  mocks.combine.mockReset();
  mocks.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
const tagButton = () => screen.getByRole("button", { name: "Tag" });
const row = (name = "review") =>
  screen.getByRole("group", { name, exact: true });
const action = (name: "Add" | "Remove" | "Undo", tag = "review") =>
  within(row(tag)).getByRole("button", { name, exact: true });
const applyButton = () =>
  screen.getByRole("button", { name: /^Apply(?: to |$)/ });
const writes = () => mocks.request.mock.calls.filter((call) => call[2].changes);
const open = async () => {
  fireEvent.click(tagButton());
  await screen.findByRole("group", { name: "review", exact: true });
};
function samples(ids: string[]): GridSelectionActionContext {
  const full = ids.map((episodeId) => ({
    episodeId,
    kind: "episode" as const,
  }));
  return {
    ...context(),
    mediaType: "image",
    unit: selectionUnit("image", null),
    counts: {
      ...context().counts,
      episodes: ids.length,
      fullEpisodes: ids.length,
      segments: 0,
      segmentEpisodes: 0,
    },
    groups: full.map((member) => ({
      episodeId: member.episodeId,
      members: [member],
    })),
    resolve: vi.fn(async () => ({ kind: "members", members: full })),
  };
}
function results(key = "view-a"): GridSelectionActionContext {
  return {
    ...samples(["a", "b", "c", "d"]),
    scopeKey: key,
    source: "results",
    groups: [],
    resolve: vi.fn(async () => ({
      kind: "snapshot",
      snapshotId: key,
      counts: samples(["a", "b", "c", "d"]).counts,
    })),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("shows current membership, explicit mixed actions, and row Undo without writing", async () => {
  mocks.request.mockResolvedValue({
    ...unapplied,
    targets: 4,
    applied: { review: 2 },
  });
  render(<Host value={samples(["a", "b", "c", "d"])} />);
  await open();
  expect(within(row()).getByText("On 2 of 4")).toBeTruthy();
  expect(action("Add")).toBeTruthy();
  expect(action("Remove")).toBeTruthy();
  fireEvent.click(within(row()).getByText("review"));
  expect(within(row()).queryByText(/Will/)).toBeNull();
  fireEvent.click(action("Add"));
  expect(within(row()).getByText("Will add to 2 samples")).toBeTruthy();
  expect(within(row()).getByText("On 2 of 4")).toBeTruthy();
  fireEvent.click(action("Undo"));
  fireEvent.click(action("Remove"));
  expect(within(row()).getByText("Will remove from 2 samples")).toBeTruthy();
  fireEvent.click(action("Undo"));
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  expect(mocks.request).toHaveBeenCalledOnce();
});

it("keeps the popup and draft open after outside clicks", async () => {
  render(
    <>
      <button>Grid</button>
      <Host value={samples(["a"])} />
    </>,
  );
  await open();
  fireEvent.click(action("Add"));
  fireEvent.pointerDown(screen.getByRole("button", { name: "Grid" }));
  fireEvent.click(screen.getByRole("button", { name: "Grid" }));
  expect(action("Undo")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByRole("group", { name: "review", exact: true }),
  ).toBeNull();
  expect(writes()).toHaveLength(0);
});

it("follows the selection and preserves pending actions, including temporary no-ops", async () => {
  const initial = samples(["a"]);
  mocks.request.mockResolvedValueOnce(unapplied);
  const rendered = render(<Host value={initial} />);
  await open();
  fireEvent.click(action("Add"));
  const other = samples(["b", "c"]);
  mocks.request.mockResolvedValueOnce({
    ...applied,
    targets: 2,
    applied: { review: 2 },
  });
  rendered.rerender(<Host value={other} />);
  await screen.findByText("No change");
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  expect(action("Undo")).toBeTruthy();
  const next = samples(["d", "e", "f"]);
  mocks.request.mockResolvedValueOnce({ ...unapplied, targets: 3 });
  rendered.rerender(<Host value={next} />);
  await screen.findByText("Will add to 3 samples");
  mocks.request.mockResolvedValueOnce({
    ...applied,
    targets: 3,
    applied: { review: 3 },
  });
  fireEvent.click(applyButton());
  await screen.findByText("Applied");
  expect(writes()).toHaveLength(1);
  expect(writes()[0][1]).toEqual({
    kind: "members",
    members: ["d", "e", "f"].map((episodeId) => ({
      episodeId,
      kind: "episode",
    })),
  });
  expect(next.resolve).toHaveBeenCalledTimes(2);
});

it("does not widen a cleared selection, and requires an explicit all-in-view action", async () => {
  const rendered = render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.click(action("Add"));
  const all = results();
  rendered.rerender(<Host value={all} />);
  await screen.findByText("Nothing selected");
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  expect(all.resolve).not.toHaveBeenCalled();
  expect(action("Undo")).toBeTruthy();
  mocks.request.mockResolvedValueOnce({ ...unapplied, targets: 4 });
  fireEvent.click(
    screen.getByRole("button", { name: "Tag all 4 samples in view" }),
  );
  await screen.findByText("Will add to 4 samples");
  rendered.rerender(<Host value={samples(["b"])} />);
  await screen.findByText("Will add to 1 sample");
  rendered.rerender(<Host value={all} />);
  await screen.findByText("Nothing selected");
  expect(applyButton().hasAttribute("disabled")).toBe(true);
});

it("keeps an empty active section idle and preserves drafts when switching back", async () => {
  const first = {
    ...samples(["a"]),
    bucket: { id: "first", name: "Section 1" },
  };
  const rendered = render(<Host value={first} />);
  await open();
  fireEvent.click(action("Add"));

  const empty = {
    ...samples([]),
    bucket: { id: "second", name: "Section 2" },
  };
  rendered.rerender(<Host value={empty} />);
  await screen.findByText("No samples in Section 2");
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Updating tags…")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Tag all/ })).toBeNull();
  expect(
    screen.getByLabelText("Create or find tag").hasAttribute("disabled"),
  ).toBe(true);
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  expect(action("Undo")).toBeTruthy();

  rendered.rerender(<Host value={first} />);
  await screen.findByText("Will add to 1 sample");
  expect(applyButton().hasAttribute("disabled")).toBe(false);
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(applyButton());
  await screen.findByText("Applied");
  expect(writes()).toHaveLength(1);
  expect(writes()[0][1]).toEqual({
    kind: "members",
    members: [{ episodeId: "a", kind: "episode" }],
  });
});

it("refreshes all-results membership when filters change even if counts match", async () => {
  const first = results("filtered-a");
  const rendered = render(<Host value={first} />);
  fireEvent.click(tagButton());
  expect(first.resolve).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Tag all 4 samples in view" }),
  );
  await screen.findByRole("group", { name: "review", exact: true });
  fireEvent.click(action("Add"));
  const next = results("filtered-b");
  rendered.rerender(<Host value={next} />);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      expect.objectContaining({ snapshotId: "filtered-b" }),
      expect.objectContaining({ target: "members" }),
    ),
  );
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(applyButton());
  await screen.findByText("Applied");
  expect(writes()[0][1]).toEqual(
    expect.objectContaining({ snapshotId: "filtered-b" }),
  );
});

it("ignores stale membership reads and disables Apply until the new scope is ready", async () => {
  const oldRead = deferred<typeof unapplied>();
  mocks.request.mockReturnValueOnce(oldRead.promise);
  const rendered = render(<Host value={samples(["a"])} />);
  fireEvent.click(tagButton());
  await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  mocks.request.mockResolvedValueOnce({
    ...applied,
    targets: 2,
    applied: { review: 2 },
  });
  rendered.rerender(<Host value={samples(["b", "c"])} />);
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  await screen.findByText("On all 2");
  await act(async () => oldRead.resolve(unapplied));
  expect(action("Remove")).toBeTruthy();
  expect(within(row()).queryByRole("button", { name: "Add" })).toBeNull();
});

it("ignores a superseded scope resolution", async () => {
  const late =
    deferred<Awaited<ReturnType<GridSelectionActionContext["resolve"]>>>();
  const rendered = render(
    <Host value={{ ...samples(["a"]), resolve: () => late.promise }} />,
  );
  fireEvent.click(tagButton());
  const next = samples(["b"]);
  rendered.rerender(<Host value={next} />);
  await screen.findByRole("group", { name: "review", exact: true });
  await act(async () =>
    late.resolve({
      kind: "members",
      members: [{ episodeId: "a", kind: "episode" }],
    }),
  );
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.request.mock.calls[0][1]).toEqual({
    kind: "members",
    members: [{ episodeId: "b", kind: "episode" }],
  });
});

it("freezes each save and retries the same scope after the grid selection changes", async () => {
  const initial = samples(["a"]);
  const rendered = render(<Host value={initial} />);
  await open();
  fireEvent.click(action("Add"));
  const saving = deferred<typeof applied>();
  mocks.request.mockReturnValueOnce(saving.promise);
  fireEvent.click(applyButton());
  await waitFor(() => expect(writes()).toHaveLength(1));
  rendered.rerender(<Host value={samples(["b", "c"])} />);
  fireEvent.click(tagButton());
  expect(
    screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
  ).toBe(true);
  await act(async () => saving.reject(new Error("Connection interrupted")));
  await screen.findByText(
    "Some changes may be saved. Retry uses the original selection.",
  );
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
  await screen.findByText("Applied");
  expect(writes()).toHaveLength(2);
  expect(writes()[1]).toEqual(writes()[0]);
  expect(initial.resolve).toHaveBeenCalledTimes(2);
  await screen.findByText("Tag 2 selected samples");
});

it("re-resolves all results at Apply and pins the returned snapshot for retries", async () => {
  const base = results();
  const first = {
    kind: "snapshot" as const,
    snapshotId: "read",
    counts: base.counts,
  };
  const saved = { ...first, snapshotId: "save" };
  const resolve = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(saved);
  render(<Host value={{ ...base, resolve }} />);
  fireEvent.click(tagButton());
  fireEvent.click(
    screen.getByRole("button", { name: "Tag all 4 samples in view" }),
  );
  await screen.findByRole("group", { name: "review", exact: true });
  fireEvent.click(action("Add"));
  mocks.request.mockRejectedValueOnce(new Error("timeout"));
  fireEvent.click(applyButton());
  await screen.findByRole("alert");
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
  await screen.findByText("Applied");
  expect(writes().map((call) => call[1])).toEqual([saved, saved]);
  expect(resolve).toHaveBeenCalledTimes(2);
});

it("stages new tags with Enter, batches edits, and prevents duplicate Apply", async () => {
  mocks.request.mockResolvedValue({
    ...unapplied,
    tags: ["review", "train"],
    applied: { train: 1 },
  });
  render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.click(action("Remove", "train"));
  const input = screen.getByLabelText("Create or find tag");
  fireEvent.change(input, { target: { value: "  night " } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(within(row("night")).getByText("Will add to 1 sample")).toBeTruthy();
  expect(writes()).toHaveLength(0);
  const pending = deferred<typeof applied>();
  mocks.request.mockReturnValueOnce(pending.promise);
  const apply = applyButton();
  fireEvent.click(apply);
  expect(apply.hasAttribute("disabled")).toBe(true);
  fireEvent.click(apply);
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0][2].changes).toEqual({ train: false, night: true });
  await act(async () => pending.resolve(applied));
  await screen.findByText("Applied");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("prevents target switches by mouse or keyboard until drafts are applied or undone", async () => {
  render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.click(action("Add"));
  const labels = screen.getByRole("radio", { name: "Labels" });
  expect(labels.hasAttribute("disabled")).toBe(true);
  fireEvent.click(labels);
  fireEvent.keyDown(screen.getByRole("radio", { name: "Samples" }), {
    key: "ArrowRight",
  });
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(action("Undo")).toBeTruthy();
  fireEvent.click(action("Undo"));
  mocks.request.mockResolvedValueOnce({ ...unapplied, labels: 2, targets: 2 });
  fireEvent.click(labels);
  await screen.findByRole("button", { name: "Apply to 2 labels" });
  fireEvent.click(action("Add"));
  expect(screen.getByText("Will add to 2 labels")).toBeTruthy();
});

it("refreshes group expansion for the live selection and again at Apply", async () => {
  const scope = {
    kind: "snapshot",
    snapshotId: "siblings",
    counts: samples(["a", "b"]).counts,
  };
  mocks.combine.mockResolvedValue(scope);
  render(<Host value={{ ...samples(["a"]), mediaType: "group" }} />);
  await open();
  fireEvent.click(
    screen.getByRole("radio", { name: "All slices of these groups" }),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith(
      "dataset",
      scope,
      expect.anything(),
    ),
  );
  fireEvent.click(action("Add"));
  expect(
    screen
      .getByRole("radio", { name: "Selected samples" })
      .hasAttribute("disabled"),
  ).toBe(true);
  mocks.request.mockResolvedValueOnce(applied);
  fireEvent.click(applyButton());
  await screen.findByText("Applied");
  expect(mocks.combine).toHaveBeenCalledTimes(2);
  expect(writes()[0][1]).toEqual(scope);
});

it.each(["ToPatches", "ToEvaluationPatches", "ToFrames", "ToClips"])(
  "tags source labels in %s",
  async (stage) => {
    const conversion =
      stage === "ToFrames"
        ? "frames"
        : stage === "ToClips"
          ? "clips"
          : "patches";
    const value = {
      ...samples(["a"]),
      conversion,
      unit: selectionUnit("image", conversion),
      view: [{ _cls: `fiftyone.core.stages.${stage}`, kwargs: [] }],
    } as GridSelectionActionContext;
    mocks.request.mockResolvedValue({ ...unapplied, labels: 1 });
    render(<Host value={value} />);
    await open();
    expect(screen.getByText("Tag source labels")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Labels" })).toBeNull();
    fireEvent.click(action("Add"));
    mocks.request.mockResolvedValueOnce({ ...applied, labels: 1 });
    fireEvent.click(applyButton());
    await screen.findByText("Applied");
    expect(writes()[0][2]).toEqual({
      target: "labels",
      view: value.view,
      changes: { review: true },
    });
  },
);

it("preserves timebase and permission restrictions", async () => {
  const value = context();
  render(<Host value={value} />);
  await open();
  expect(
    screen.getByRole("radio", { name: "Labels" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...value,
      counts: { ...value.counts, unavailable: 1 },
    }),
  ).toContain("unavailable");
});

it("blocks edits if permission is revoked or the tag target is unsupported", async () => {
  const value = samples(["a"]);
  const rendered = render(<Host value={value} />);
  await open();
  mocks.permission = "Permission revoked";
  rendered.rerender(<Host value={value} />);
  expect(action("Add").hasAttribute("disabled")).toBe(true);
  expect(
    screen.getByRole("button", { name: "Done" }).hasAttribute("disabled"),
  ).toBe(false);
});

it("handles empty or unsupported label targets", async () => {
  const reason = "These clips have no single source label to tag.";
  mocks.request.mockResolvedValue({
    tags: [],
    applied: {},
    targets: 0,
    labels: 0,
    disabledReason: reason,
  });
  render(
    <Host
      value={{
        ...samples(["a"]),
        conversion: "clips",
        unit: selectionUnit("video", "clips"),
      }}
    />,
  );
  fireEvent.click(tagButton());
  await screen.findByText(reason);
  expect(applyButton().hasAttribute("disabled")).toBe(true);
});

it("never removes a tag when entering its name", async () => {
  mocks.request.mockResolvedValue(applied);
  render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.change(screen.getByLabelText("Create or find tag"), {
    target: { value: "review" },
  });
  fireEvent.keyDown(screen.getByLabelText("Create or find tag"), {
    key: "Enter",
  });
  expect(action("Remove")).toBeTruthy();
  expect(applyButton().hasAttribute("disabled")).toBe(true);
});

it("refreshes an expired selection only with explicit review and a new Apply", async () => {
  const rendered = render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.click(action("Add"));
  mocks.request.mockRejectedValueOnce(
    new NetworkError(
      {
        code: 410,
        statusText: "Gone",
        bodyResponse: "",
        payload: {},
        route: "/selection/tags",
        requestHeaders: {},
        responseHeaders: new Headers(),
      },
      "Selection expired",
    ),
  );
  fireEvent.click(applyButton());
  await screen.findByText("Selection expired. Refresh to review your edits.");
  expect(
    screen
      .getByRole("button", { name: "Retry", exact: true })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(writes()).toHaveLength(1);
  rendered.rerender(<Host value={samples(["b", "c"])} />);
  mocks.request.mockResolvedValue({ ...unapplied, targets: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Refresh selection" }));
  await screen.findByText("Will add to 2 samples");
  expect(writes()).toHaveLength(1);
  fireEvent.click(applyButton());
  await screen.findByText("Applied");
  expect(writes()).toHaveLength(2);
  expect(writes()[1][1]).toEqual({
    kind: "members",
    members: ["b", "c"].map((episodeId) => ({ episodeId, kind: "episode" })),
  });
});

it("keeps keyboard focus on Add, Remove, and Undo, falling back to search for a removed draft row", async () => {
  mocks.request.mockResolvedValue({
    ...unapplied,
    targets: 2,
    applied: { review: 1 },
  });
  render(<Host value={samples(["a", "b"])} />);
  await open();
  action("Add").focus();
  fireEvent.click(action("Add"));
  expect(document.activeElement).toBe(action("Undo"));
  fireEvent.click(action("Undo"));
  expect(document.activeElement).toBe(action("Add"));
  action("Remove").focus();
  fireEvent.click(action("Remove"));
  expect(document.activeElement).toBe(action("Undo"));
  fireEvent.click(action("Undo"));
  const input = screen.getByLabelText("Create or find tag");
  fireEvent.change(input, { target: { value: "new" } });
  fireEvent.keyDown(input, { key: "Enter" });
  action("Undo", "new").focus();
  fireEvent.click(action("Undo", "new"));
  expect(document.activeElement).toBe(input);
});

it("keeps rows while refreshing but hides old counts and disables actions", async () => {
  const rendered = render(<Host value={samples(["a"])} />);
  await open();
  const pending = deferred<typeof unapplied>();
  mocks.request.mockReturnValueOnce(pending.promise);
  rendered.rerender(<Host value={samples(["b", "c"])} />);
  await screen.findByText("Updating tags…");
  expect(row()).toBeTruthy();
  expect(within(row()).queryByText("Not on this sample")).toBeNull();
  expect(action("Add").hasAttribute("disabled")).toBe(true);
  await act(async () => pending.resolve({ ...unapplied, targets: 2 }));
  await screen.findByText("Not on these samples");
});

it("does not discard drafts when pressing Tag again", async () => {
  render(<Host value={samples(["a"])} />);
  await open();
  fireEvent.click(action("Add"));
  fireEvent.click(tagButton());
  expect(action("Undo")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await open();
  expect(applyButton().hasAttribute("disabled")).toBe(true);
});

it("explains incompatible segment selections while keeping pending label edits", async () => {
  const rendered = render(<Host value={samples(["a"])} />);
  await open();
  mocks.request.mockResolvedValueOnce({ ...unapplied, labels: 1 });
  fireEvent.click(screen.getByRole("radio", { name: "Labels" }));
  await screen.findByRole("button", { name: "Apply to 1 label" });
  fireEvent.click(action("Add"));
  const reads = mocks.request.mock.calls.length;
  rendered.rerender(<Host value={context()} />);
  await screen.findByText("Label tagging needs whole episodes");
  expect(action("Undo")).toBeTruthy();
  expect(applyButton().hasAttribute("disabled")).toBe(true);
  expect(mocks.request).toHaveBeenCalledTimes(reads);
  fireEvent.click(action("Undo"));
  fireEvent.click(screen.getByRole("radio", { name: "Segments" }));
  await screen.findByRole("button", { name: "Apply to 1 stream range" });
});

it("names mixed whole episodes and segments and rejects unsupported timebases", async () => {
  const base = context();
  const mixed = [...members, { episodeId: "whole", kind: "episode" as const }];
  render(
    <Host
      value={{
        ...base,
        counts: { ...base.counts, episodes: 2, fullEpisodes: 1 },
        groups: [{ episodeId: "episode", members: mixed }],
        resolve: async () => ({ kind: "members", members: mixed }),
      }}
    />,
  );
  await open();
  expect(
    screen.getByRole("radio", { name: "Episodes and segments" }),
  ).toBeTruthy();
  const member = members[0];
  expect(
    gridActionDisabledReason(tagSelectionAction, {
      ...base,
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
});

it("keeps shared action registrations alive across grids", async () => {
  const first = render(<Host value={context()} />);
  const second = render(<Host value={context()} />);
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Tag" })).toHaveLength(2),
  );
  first.unmount();
  expect(screen.getAllByRole("button", { name: "Tag" })).toHaveLength(1);
  second.unmount();
});

it("settles on an empty results view instead of fetching or loading forever", async () => {
  const rendered = render(<Host value={results()} />);
  fireEvent.click(tagButton());
  fireEvent.click(
    screen.getByRole("button", { name: "Tag all 4 samples in view" }),
  );
  await screen.findByRole("group", { name: "review", exact: true });
  fireEvent.click(action("Add"));
  const empty = { ...results("empty-view"), counts: samples([]).counts };
  rendered.rerender(<Host value={empty} />);
  await screen.findByText("No samples in view");
  expect(empty.resolve).not.toHaveBeenCalled();
  expect(screen.queryByText("Updating tags…")).toBeNull();
  expect(action("Undo")).toBeTruthy();
  expect(applyButton().hasAttribute("disabled")).toBe(true);
});
