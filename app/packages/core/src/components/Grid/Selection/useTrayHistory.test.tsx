import { CommandContextManager, KnownContexts } from "@fiftyone/commands";
import {
  useActiveSelectionBucket,
  useEpisodeSelectionActions,
  useSelectionBucketCaptures,
  useSelectionSections,
  type EpisodeSelection,
} from "@fiftyone/state/src/selection";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useTrayHistory } from "./useTrayHistory";

const whole = (id: string): EpisodeSelection => ({
  episodeId: id,
  members: [{ episodeId: id, kind: "episode" }],
});

const grid = () =>
  CommandContextManager.instance().getCommandContext(KnownContexts.Default)!;

function setup(dataset: string) {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(
    ({ scope }: { scope: string }) => {
      useTrayHistory(dataset, scope);
      return {
        picks: useEpisodeSelectionActions(dataset),
        captures: useSelectionBucketCaptures(dataset),
        active: useActiveSelectionBucket(dataset),
        sections: useSelectionSections(dataset),
      };
    },
    { wrapper, initialProps: { scope: "all" } },
  );
}

const picked = (captures: ReadonlyMap<string, ReadonlyMap<string, unknown>>) =>
  [...captures].map(([id, bucket]) => [id, [...bucket.keys()]]);

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

describe("tray history", () => {
  it("steps back and forth through picks and section changes", async () => {
    const { result } = setup("history");
    expect(grid().canUndo()).toBe(false);
    act(() => {
      result.current.picks.capture(whole("a"));
    });
    act(() => result.current.sections.split());
    expect(grid().canUndo()).toBe(true);

    await act(() => grid().undo());
    expect(picked(result.current.captures)).toEqual([["primary", ["a"]]]);
    await act(() => grid().undo());
    expect(picked(result.current.captures)).toEqual([["primary", []]]);
    expect(grid().canUndo()).toBe(false);

    // replaying a step is not itself a step
    await act(() => grid().redo());
    await act(() => grid().redo());
    expect(result.current.captures.size).toBe(2);
    expect(grid().canRedo()).toBe(false);
  });

  it("puts back the active section without making activation a step", async () => {
    const { result } = setup("active");
    act(() => result.current.sections.split());
    const [, second] = [...result.current.captures.keys()];
    act(() => result.current.active.activate(second));
    act(() => {
      result.current.picks.capture(whole("a"));
    });
    act(() => result.current.active.activate("primary"));

    // the pick is undone, and the section it landed in is active again
    await act(() => grid().undo());
    expect(picked(result.current.captures)).toEqual([
      ["primary", []],
      [second, []],
    ]);
    expect(result.current.active.active).toBe(second);
    await act(() => grid().undo());
    expect(result.current.captures.size).toBe(1);
    expect(grid().canUndo()).toBe(false);
  });

  it("leaves history behind with the scope it happened in", () => {
    const { result, rerender, unmount } = setup("scoped");
    act(() => {
      result.current.picks.capture(whole("a"));
    });
    expect(grid().canUndo()).toBe(true);
    rerender({ scope: "subset" });
    expect(grid().canUndo()).toBe(false);
    act(() => {
      result.current.picks.capture(whole("b"));
    });
    expect(grid().canUndo()).toBe(true);
    unmount();
    expect(grid().canUndo()).toBe(false);
  });
});
