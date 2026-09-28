import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGroupActionScope } from "./useGroupActionScope";

const combine = vi.hoisted(() => vi.fn());
vi.mock("@fiftyone/state/src/selection", async () => ({
  ...(await import("@fiftyone/state/src/selection/model")),
  combineSelectionCaptures: combine,
}));
afterEach(cleanup);
beforeEach(() => {
  combine.mockReset();
});

it("freezes each base once, and invalidates expansion when the base changes", async () => {
  combine.mockImplementation(async (_dataset, request) => ({
    kind: "snapshot",
    snapshotId: `expanded-${request.members[0].episodeId}`,
    counts: {
      episodes: 2,
      fullEpisodes: 2,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
    },
  }));
  const view: readonly unknown[] = [];
  const { result, rerender } = renderHook(
    ({ id }) =>
      useGroupActionScope(
        "dataset",
        "group",
        {
          kind: "members",
          members: [{ episodeId: id, kind: "episode" }],
        },
        view,
      ),
    { initialProps: { id: "a" } },
  );
  act(() => result.current.setChoice("all"));
  await waitFor(() =>
    expect(result.current.scope).toMatchObject({ snapshotId: "expanded-a" }),
  );
  act(() => result.current.setChoice("slice"));
  act(() => result.current.setChoice("all"));
  expect(combine).toHaveBeenCalledTimes(1);
  rerender({ id: "b" });
  await waitFor(() =>
    expect(result.current.scope).toMatchObject({ snapshotId: "expanded-b" }),
  );
  expect(combine).toHaveBeenCalledTimes(2);
});

it("keeps expansion failures out of the selected-samples scope", async () => {
  combine.mockRejectedValueOnce(new Error("Expansion failed"));
  const base = {
    kind: "members" as const,
    members: [{ episodeId: "a", kind: "episode" as const }],
  };
  const view: readonly unknown[] = [];
  const { result } = renderHook(() =>
    useGroupActionScope("dataset", "group", base, view),
  );
  act(() => result.current.setChoice("all"));
  await waitFor(() =>
    expect(result.current.error).toContain("Expansion failed"),
  );
  act(() => result.current.setChoice("slice"));
  expect(result.current.error).toBeNull();
  expect(result.current.scope).toBe(base);
});
