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
}));
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  ...(await import("@fiftyone/state/src/selection/hooks")),
  selectionTagsRequest: mocks.request,
  subsetRequest: vi.fn(),
}));

beforeEach(() => {
  mocks.permission = null;
  mocks.request.mockReset().mockResolvedValue({ tags: ["review"] });
  mocks.refresh.mockClear();
});
afterEach(() => vi.restoreAllMocks());

function context(): GridSelectionActionContext {
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
    resolve: vi.fn(async () => members),
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

it("retains frozen membership through scope changes, errors, and retries", async () => {
  const value = context();
  const rendered = render(<Host value={value} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Tag", exact: true }),
  );
  await screen.findByRole("dialog");
  rendered.rerender(
    <Host
      value={{ ...value, source: "results", resolve: vi.fn(async () => []) }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  mocks.request.mockRejectedValueOnce(new Error("Connection interrupted"));
  fireEvent.click(
    screen.getByRole("button", { name: "Apply tag", exact: true }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Apply tag", exact: true }),
  );
  await screen.findByRole("status");
  expect(mocks.request.mock.calls[1]).toEqual(mocks.request.mock.calls[2]);
  expect(mocks.request.mock.calls[2]).toEqual([
    "dataset",
    value.groups[0].members,
    { tag: "review", add: true },
    "members",
  ]);
  expect(value.resolve).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  rendered.unmount();
});

it("uses complete result membership and sends explicit removal intent", async () => {
  const value = { ...context(), source: "results" as const };
  const rendered = render(<Host value={value} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Tag", exact: true }),
  );
  await screen.findByText(/Captured all current results/);
  fireEvent.click(
    screen.getByRole("button", { name: "Remove tag", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove from captured scope" }),
  );
  await screen.findByRole("status");
  expect(mocks.request).toHaveBeenLastCalledWith(
    "dataset",
    value.groups[0].members,
    { tag: "review", add: false },
    "members",
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
    (
      await screen.findByRole("button", { name: "Tag", exact: true })
    ).hasAttribute("disabled"),
  ).toBe(true);
  mocks.permission = null;
  rendered.rerender(<Host value={value} />);
  fireEvent.click(screen.getByRole("button", { name: "Tag", exact: true }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  mocks.permission = "Permission revoked";
  rendered.rerender(<Host value={value} />);
  expect(
    screen
      .getByRole("button", { name: "Apply tag", exact: true })
      .hasAttribute("disabled"),
  ).toBe(true);
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
  fireEvent.click(
    await screen.findByRole("button", { name: "Tag", exact: true }),
  );
  await screen.findByRole("dialog");
  expect(
    screen
      .getByRole("button", { name: "Labels", exact: true })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const full = [{ episodeId: "episode", kind: "episode" as const }];
  rendered.rerender(
    <Host
      value={{
        ...value,
        groups: [{ episodeId: "episode", members: full }],
        resolve: async () => full,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Tag", exact: true }));
  await screen.findByRole("dialog");
  mocks.request.mockResolvedValueOnce({ tags: ["review"], labels: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Labels", exact: true }));
  await screen.findByText("No labels in these episodes.");
  fireEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  expect(
    screen.getByRole("button", { name: "Apply tag" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Samples", exact: true }));
  mocks.request.mockResolvedValueOnce({ tags: ["review"], labels: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Labels", exact: true }));
  await screen.findByText("TAG 2 LABELS");
  fireEvent.click(screen.getByRole("button", { name: "review", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Apply tag", exact: true }),
  );
  await screen.findByRole("status");
  expect(mocks.request).toHaveBeenLastCalledWith(
    "dataset",
    full,
    { tag: "review", add: true },
    "labels",
  );
  rendered.unmount();
});
