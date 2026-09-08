import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemporalTagModeActions } from "./use-temporal-tag-mode";
import { TemporalTagProvider } from "./TemporalTagContext";
import TemporalTagPopup from "./TemporalTagPopup";

const playbackMocks = vi.hoisted(() => ({ seek: vi.fn() }));

vi.mock("../../lib/playback/PlaybackProvider", () => ({
  usePlayback: () => ({ seek: playbackMocks.seek }),
}));

function makeActions(): TemporalTagModeActions {
  return {
    enterTagMode: vi.fn(),
    exitTagMode: vi.fn(),
    startDrag: vi.fn(),
    updateDrag: vi.fn(),
    finishDrag: vi.fn(),
    startEdit: vi.fn(),
    setAnchorHandle: vi.fn(),
    setLabel: vi.fn(),
    cancel: vi.fn(),
  };
}

describe("TemporalTagPopup", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("seeks to the tag start after creation succeeds", async () => {
    const actions = makeActions();
    let resolveCreate!: () => void;
    const onTagCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    render(
      <TemporalTagProvider
        value={{
          state: {
            phase: "selected",
            mode: "create",
            editId: null,
            selection: { start: 2, end: 4 },
            previewStart: null,
            previewEnd: null,
            anchor: { x: 100, y: 100 },
            pendingLabel: "review",
          },
          actions,
          onTagCreate,
        }}
      >
        <TemporalTagPopup />
      </TemporalTagProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onTagCreate).toHaveBeenCalledWith({
      start: 2,
      end: 4,
      tag: "review",
    });
    expect(playbackMocks.seek).not.toHaveBeenCalled();

    await act(async () => resolveCreate());

    expect(playbackMocks.seek).toHaveBeenCalledWith(2);
    expect(actions.exitTagMode).toHaveBeenCalledOnce();
  });
});
