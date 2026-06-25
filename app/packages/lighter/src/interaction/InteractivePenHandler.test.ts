/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import type { Undoable } from "@fiftyone/commands";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddMaskKeypointCommand } from "../commands/AddMaskKeypointCommand";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import { InteractivePenHandler } from "./InteractivePenHandler";
import type { OverlayEvent } from "./InteractionManager";

type AddKeypointReturn = string | null;

const makeOverlay = (
  addMaskKeypoint?: (...args: unknown[]) => AddKeypointReturn,
) => {
  let nextId = 0;
  const addMaskKeypointFn = vi.fn(() => {
    nextId += 1;
    return `kp-${nextId}`;
  });

  const overlay = {
    addMaskKeypoint: addMaskKeypoint ?? addMaskKeypointFn,
    removeMaskKeypointById: vi.fn(),
    updatePenMousePosition: vi.fn(),
    markDirty: vi.fn(),
  } as unknown as DetectionOverlay;

  return {
    overlay,
    addMaskKeypoint: overlay.addMaskKeypoint as ReturnType<typeof vi.fn>,
    removeMaskKeypointById: overlay.removeMaskKeypointById as ReturnType<
      typeof vi.fn
    >,
    updatePenMousePosition: overlay.updatePenMousePosition as ReturnType<
      typeof vi.fn
    >,
    markDirty: overlay.markDirty as ReturnType<typeof vi.fn>,
  };
};

const makeEvent = (worldPoint = { x: 1, y: 2 }, buttons = 0): OverlayEvent =>
  ({
    worldPoint,
    event: { buttons } as PointerEvent,
  }) as OverlayEvent;

// Replace the active context's command-stack methods with spies for the
// duration of one test. The real CommandContext is preserved otherwise.
const spyActiveContext = () => {
  const pushed: Undoable[] = [];
  const context = CommandContextManager.instance().getActiveContext();
  const pushUndoable = vi
    .spyOn(context, "pushUndoable")
    .mockImplementation((u: Undoable) => {
      pushed.push(u);
    });
  const pruneUndoables = vi
    .spyOn(context, "pruneUndoables")
    .mockImplementation((predicate: (u: Undoable) => boolean) => {
      for (let i = pushed.length - 1; i >= 0; i -= 1) {
        if (predicate(pushed[i])) pushed.splice(i, 1);
      }
    });
  return { pushed, pushUndoable, pruneUndoables };
};

describe("InteractivePenHandler", () => {
  beforeEach(() => {
    CommandContextManager.instance().reset();
    vi.restoreAllMocks();
  });

  it("identifies as the pen handler with crosshair cursor and captures all clicks", () => {
    const { overlay } = makeOverlay();
    const handler = new InteractivePenHandler(overlay);

    expect(handler.id).toBe("interactive-pen-handler");
    expect(handler.cursor).toBe("crosshair");
    expect(handler.containsPoint()).toBe(true);
    expect(handler.getOverlay()).toBe(overlay);
  });

  it("onPointerDown places a non-dragging point and pushes an undoable", () => {
    const { overlay, addMaskKeypoint } = makeOverlay();
    const { pushed } = spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    const point = { x: 5, y: 7 };
    expect(handler.onPointerDown(makeEvent(point))).toBe(true);

    expect(addMaskKeypoint).toHaveBeenCalledTimes(1);
    expect(addMaskKeypoint).toHaveBeenCalledWith(point, { dragging: false });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toBeInstanceOf(AddMaskKeypointCommand);
  });

  it("onMove with left button held places a dragging point", () => {
    const { overlay, addMaskKeypoint, updatePenMousePosition } = makeOverlay();
    spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    const point = { x: 3, y: 4 };
    handler.onMove(makeEvent(point, /* buttons */ 1));

    expect(addMaskKeypoint).toHaveBeenCalledWith(point, { dragging: true });
    expect(updatePenMousePosition).not.toHaveBeenCalled();
  });

  it("onMove without left button held updates the preview position only", () => {
    const { overlay, addMaskKeypoint, updatePenMousePosition } = makeOverlay();
    spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    const point = { x: 8, y: 9 };
    handler.onMove(makeEvent(point, /* buttons */ 0));

    expect(addMaskKeypoint).not.toHaveBeenCalled();
    expect(updatePenMousePosition).toHaveBeenCalledTimes(1);
    expect(updatePenMousePosition).toHaveBeenCalledWith(point);
  });

  it("onMove respects other mouse buttons but ignores them (only left = 1 places)", () => {
    const { overlay, addMaskKeypoint, updatePenMousePosition } = makeOverlay();
    spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    // buttons=2 → right button only; should not place
    handler.onMove(makeEvent({ x: 1, y: 1 }, 2));
    expect(addMaskKeypoint).not.toHaveBeenCalled();
    expect(updatePenMousePosition).toHaveBeenCalledTimes(1);

    // buttons=3 → left + right held; should place (LEFT_MOUSE_BUTTON & buttons)
    handler.onMove(makeEvent({ x: 2, y: 2 }, 3));
    expect(addMaskKeypoint).toHaveBeenCalledTimes(1);
  });

  it("does not push an undoable when overlay rejects the keypoint (returns null)", () => {
    const overlay = {
      addMaskKeypoint: vi.fn(() => null),
      removeMaskKeypointById: vi.fn(),
      updatePenMousePosition: vi.fn(),
      markDirty: vi.fn(),
    } as unknown as DetectionOverlay;
    const { pushed } = spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    handler.onPointerDown(makeEvent({ x: 0, y: 0 }));

    expect(pushed).toHaveLength(0);
  });

  it("onCanvasLeave clears the preview position", () => {
    const { overlay, updatePenMousePosition } = makeOverlay();
    const handler = new InteractivePenHandler(overlay);

    handler.onCanvasLeave();

    expect(updatePenMousePosition).toHaveBeenCalledWith(null);
  });

  it("cleanup clears the preview position", () => {
    const { overlay, updatePenMousePosition } = makeOverlay();
    const handler = new InteractivePenHandler(overlay);

    handler.cleanup();

    expect(updatePenMousePosition).toHaveBeenCalledWith(null);
  });

  it("markDirty delegates to the overlay", () => {
    const { overlay, markDirty } = makeOverlay();
    const handler = new InteractivePenHandler(overlay);

    handler.markDirty();

    expect(markDirty).toHaveBeenCalledTimes(1);
  });

  it("pruneCommands removes every undoable the handler pushed and only those", () => {
    const { overlay } = makeOverlay();
    const { pushed, pruneUndoables } = spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    // Push two pen points
    handler.onPointerDown(makeEvent({ x: 1, y: 1 }));
    handler.onPointerDown(makeEvent({ x: 2, y: 2 }));

    // Add an unrelated undoable that should survive pruning.
    const foreign: Undoable = {
      id: "foreign-id",
      execute: vi.fn(),
      undo: vi.fn(),
    };
    pushed.push(foreign);

    expect(pushed).toHaveLength(3);

    handler.pruneCommands();

    expect(pruneUndoables).toHaveBeenCalledTimes(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toBe(foreign);
  });

  it("pruneCommands is a no-op when nothing has been pushed", () => {
    const { overlay } = makeOverlay();
    const { pruneUndoables } = spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    handler.pruneCommands();

    expect(pruneUndoables).not.toHaveBeenCalled();
  });

  it("pruneCommands clears the internal id set so a follow-up prune is a no-op", () => {
    const { overlay } = makeOverlay();
    const { pruneUndoables } = spyActiveContext();
    const handler = new InteractivePenHandler(overlay);

    handler.onPointerDown(makeEvent({ x: 1, y: 1 }));
    handler.pruneCommands();
    handler.pruneCommands();

    expect(pruneUndoables).toHaveBeenCalledTimes(1);
  });
});
