import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

<<<<<<< HEAD
vi.mock(
  "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useAnnotationContextManager",
  () => ({ useAnnotationContextManager: vi.fn() }),
);
=======
// mocked whole (no importOriginal): the real module's graph crosses the
// core/looker-3d boundary, which a partial mock would drag in
vi.mock("../state", () => ({
  useRegisteredAnnotationContextManager: vi.fn(),
}));
>>>>>>> main

vi.mock("@fiftyone/state", () => ({
  useModalModeController: vi.fn(),
}));

vi.mock("./useAnnotationEventBus", () => ({
  useAnnotationEventBus: vi.fn(),
}));

import { useModalModeController } from "@fiftyone/state";
import { useRegisteredAnnotationContextManager } from "../state";
import { useAnnotationEventBus } from "./useAnnotationEventBus";
import { useAnnotationController } from "./useAnnotationController";

describe("useAnnotationController", () => {
  let mockContextManager: {
    enter: ReturnType<typeof vi.fn>;
    exit: ReturnType<typeof vi.fn>;
  };
  let mockModeController: {
    activateAnnotateMode: ReturnType<typeof vi.fn>;
    activateExploreMode: ReturnType<typeof vi.fn>;
  };
  let mockEventBus: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContextManager = {
      enter: vi.fn().mockResolvedValue(undefined),
      exit: vi.fn(),
    };
    mockModeController = {
      activateAnnotateMode: vi.fn(),
      activateExploreMode: vi.fn(),
    };
    mockEventBus = { dispatch: vi.fn() };

<<<<<<< HEAD
    vi.mocked(useAnnotationContextManager).mockReturnValue(
=======
    vi.mocked(useRegisteredAnnotationContextManager).mockReturnValue(
>>>>>>> main
      mockContextManager as any,
    );
    vi.mocked(useModalModeController).mockReturnValue(
      mockModeController as any,
    );
    vi.mocked(useAnnotationEventBus).mockReturnValue(mockEventBus as any);
  });

  describe("enterAnnotationMode", () => {
    it("activates annotate mode, enters context, and dispatches the enter event", async () => {
      const { result } = renderHook(() => useAnnotationController());

      await act(async () => {
        await result.current.enterAnnotationMode("predictions", "label-1");
      });

      expect(mockModeController.activateAnnotateMode).toHaveBeenCalledOnce();
      expect(mockContextManager.enter).toHaveBeenCalledWith(
        "predictions",
        "label-1",
      );
      expect(mockEventBus.dispatch).toHaveBeenCalledWith(
        "annotation:enterAnnotationMode",
        { path: "predictions", labelId: "label-1" },
      );
    });

    it("works with no arguments", async () => {
      const { result } = renderHook(() => useAnnotationController());

      await act(async () => {
        await result.current.enterAnnotationMode();
      });

      expect(mockContextManager.enter).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
      expect(mockEventBus.dispatch).toHaveBeenCalledWith(
        "annotation:enterAnnotationMode",
        { path: undefined, labelId: undefined },
      );
    });

    it("activates annotate mode before entering context", async () => {
      const callOrder: string[] = [];
      mockModeController.activateAnnotateMode.mockImplementation(() =>
        callOrder.push("activateAnnotateMode"),
      );
      mockContextManager.enter.mockImplementation(async () =>
        callOrder.push("enter"),
      );

      const { result } = renderHook(() => useAnnotationController());

      await act(async () => {
        await result.current.enterAnnotationMode();
      });

      expect(callOrder[0]).toBe("activateAnnotateMode");
      expect(callOrder[1]).toBe("enter");
    });

    it("dispatches the enter event after context.enter resolves", async () => {
      const callOrder: string[] = [];
      mockContextManager.enter.mockImplementation(async () =>
        callOrder.push("enter"),
      );
      mockEventBus.dispatch.mockImplementation(() =>
        callOrder.push("dispatch"),
      );

      const { result } = renderHook(() => useAnnotationController());

      await act(async () => {
        await result.current.enterAnnotationMode();
      });

      expect(callOrder[0]).toBe("enter");
      expect(callOrder[1]).toBe("dispatch");
    });
  });

  describe("exitAnnotationMode", () => {
    it("exits context, activates explore mode, and dispatches the exit event", () => {
      const { result } = renderHook(() => useAnnotationController());

      act(() => {
        result.current.exitAnnotationMode();
      });

      expect(mockContextManager.exit).toHaveBeenCalledOnce();
      expect(mockModeController.activateExploreMode).toHaveBeenCalledOnce();
      expect(mockEventBus.dispatch).toHaveBeenCalledWith(
        "annotation:exitAnnotationMode",
      );
    });
  });

  it("returns a stable controller reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useAnnotationController());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
