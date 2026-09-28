import {
  gridActionDisabledReason,
  useGridSelectionActions,
  type GridSelectionActionContext,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { selectionUnit } from "@fiftyone/state/src/selection/model";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
const tagRow = () => screen.getByRole("button", { name: "review" });

it("toggles a tag in place, keeping frozen membership through scope changes and retries", async () => {
  const value = context();
  const rendered = render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByText(/^Tag selected/);
  expect(screen.getByRole("radio", { name: "Segments" })).toBeTruthy();
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
  await screen.findByRole("button", { name: "review" });
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

it("names both kinds when tagging a mixed selection", async () => {
  const base = context();
  const mixed = [...members, { episodeId: "whole", kind: "episode" as const }];
  const value = {
    ...base,
    counts: { ...base.counts, episodes: 2, fullEpisodes: 1 },
    resolve: vi.fn(async () => ({ kind: "members" as const, members: mixed })),
  };
  render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  expect(
    await screen.findByRole("radio", {
      name: "Episodes and segments",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "Labels" }).hasAttribute("disabled"),
  ).toBe(true);
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
  await screen.findByRole("button", { name: "review" });
  const input = screen.getByLabelText("Create or find tag");
  fireEvent.change(input, { target: { value: "  night " } });
  expect(screen.getByText("Create “night”")).toBeTruthy();
  mocks.request.mockResolvedValueOnce({
    ...unapplied,
    tags: ["night", "review"],
    applied: { night: 1 },
  });
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByRole("button", { name: "night" });
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

it("freezes every slice once and reuses it for tag changes", async () => {
  const snapshot = {
    kind: "snapshot",
    snapshotId: "siblings",
    counts: {
      episodes: 2,
      fullEpisodes: 2,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
    },
  };
  mocks.combine.mockResolvedValue(snapshot);
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
  await screen.findByRole("button", { name: "review" });
  fireEvent.click(
    screen.getByRole("radio", { name: "All slices of these groups" }),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith("dataset", snapshot, {
      target: "members",
      view: [],
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "review" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith("dataset", snapshot, {
      change: { tag: "review", add: true },
      target: "members",
      view: [],
    }),
  );
  expect(mocks.combine).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("radio", { name: "Selected samples" }));
  fireEvent.click(
    screen.getByRole("radio", { name: "All slices of these groups" }),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith("dataset", snapshot, {
      target: "members",
      view: [],
    }),
  );
  expect(mocks.combine).toHaveBeenCalledTimes(1);
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
  await screen.findByRole("button", { name: "review" });
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
    expect(screen.getAllByRole("button", { name: "Tag" })).toHaveLength(2),
  );
  first.unmount();
  expect(screen.getAllByRole("button", { name: "Tag" })).toHaveLength(1);
  second.unmount();
});

it("tags labels only for whole episodes and handles an empty label scope", async () => {
  const value = context();
  const rendered = render(<Host value={value} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByRole("button", { name: "review" });
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
  await screen.findByRole("button", { name: "review" });
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

it.each(["ToPatches", "ToEvaluationPatches", "ToFrames", "ToClips"])(
  "offers only source label tags in %s, for selected entities and all results",
  async (stage) => {
    const full = [{ episodeId: "patch", kind: "episode" as const }];
    const conversion =
      stage === "ToFrames"
        ? "frames"
        : stage === "ToClips"
          ? "clips"
          : "patches";
    const value: GridSelectionActionContext = {
      ...context(),
      mediaType: "image",
      conversion,
      unit: selectionUnit("image", conversion),
      view: [{ _cls: `fiftyone.core.stages.${stage}`, kwargs: [] }],
      counts: {
        ...context().counts,
        fullEpisodes: 1,
        segments: 0,
        segmentEpisodes: 0,
      },
      groups: [{ episodeId: "patch", members: full }],
      resolve: async () => ({ kind: "members", members: full }),
    };
    for (const source of ["explicit", "results"] as const) {
      const scope =
        source === "explicit"
          ? { kind: "members" as const, members: full }
          : {
              kind: "snapshot" as const,
              snapshotId: "patch-snapshot",
              counts: value.counts,
            };
      mocks.request.mockClear().mockResolvedValue({ ...unapplied, labels: 1 });
      const rendered = render(
        <Host value={{ ...value, source, resolve: async () => scope }} />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
      await screen.findByText("Tag source labels");
      expect(screen.queryByRole("radio", { name: "Patches" })).toBeNull();
      await waitFor(() =>
        expect(mocks.request).toHaveBeenLastCalledWith("dataset", scope, {
          target: "labels",
          view: value.view,
        }),
      );
      for (const add of [true, false]) {
        mocks.request.mockResolvedValueOnce({
          ...(add ? applied : unapplied),
          labels: 1,
        });
        fireEvent.click(await screen.findByRole("button", { name: "review" }));
        await waitFor(() =>
          expect(tagRow().getAttribute("aria-pressed")).toBe(String(add)),
        );
        expect(mocks.request).toHaveBeenLastCalledWith("dataset", scope, {
          target: "labels",
          view: value.view,
          change: { tag: "review", add },
        });
      }
      expect(
        mocks.request.mock.calls.every((call) => call[2].target === "labels"),
      ).toBe(true);
      rendered.unmount();
    }
  },
);

it("explains why anonymous clips cannot be tagged and blocks writes", async () => {
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
        ...context(),
        conversion: "clips",
        unit: selectionUnit("video", "clips"),
      }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Tag" }));
  await screen.findByText(reason);
  expect(
    screen
      .getByRole("textbox", { name: "Create or find tag" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.queryByText("No tags yet. Type a name to create one."),
  ).toBeNull();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
