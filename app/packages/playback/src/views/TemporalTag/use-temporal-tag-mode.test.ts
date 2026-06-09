import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTemporalTagMode } from "./use-temporal-tag-mode";

describe("useTemporalTagMode", () => {
  describe("initial state", () => {
    it("starts in idle phase with no selection", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.selection).toBeNull();
      expect(result.current.state.anchor).toBeNull();
      expect(result.current.state.previewStart).toBeNull();
      expect(result.current.state.previewEnd).toBeNull();
      expect(result.current.state.pendingLabel).toBe("");
    });
  });

  describe("enterTagMode", () => {
    it("transitions from idle to ready", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode());
      expect(result.current.state.phase).toBe("ready");
    });

    it("is a no-op when already in ready phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode());
      act(() => result.current.actions.enterTagMode());
      expect(result.current.state.phase).toBe("ready");
    });
  });

  describe("exitTagMode", () => {
    it("resets to idle from ready", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode());
      act(() => result.current.actions.exitTagMode());
      expect(result.current.state.phase).toBe("idle");
    });

    it("resets to idle from selecting", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.exitTagMode());
      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.previewStart).toBeNull();
    });

    it("resets to idle from selected", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(4));
      act(() => result.current.actions.finishDrag(0, 0));
      act(() => result.current.actions.exitTagMode());
      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.selection).toBeNull();
    });
  });

  describe("startDrag", () => {
    it("sets phase to selecting and initializes both preview bounds to startTime", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(2.5));
      expect(result.current.state.phase).toBe("selecting");
      expect(result.current.state.previewStart).toBe(2.5);
      expect(result.current.state.previewEnd).toBe(2.5);
    });

    it("clears any prior selection when a new drag begins", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(5));
      act(() => result.current.actions.finishDrag(0, 0));
      act(() => result.current.actions.startDrag(3));
      expect(result.current.state.selection).toBeNull();
      expect(result.current.state.phase).toBe("selecting");
    });
  });

  describe("updateDrag", () => {
    it("updates previewEnd while selecting", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(4));
      expect(result.current.state.previewEnd).toBe(4);
      expect(result.current.state.previewStart).toBe(1);
    });

    it("also updates previewStart when an explicit startTime is passed", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(4, 2));
      expect(result.current.state.previewStart).toBe(2);
      expect(result.current.state.previewEnd).toBe(4);
    });

    it("is a no-op when not in selecting phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode()); // ready phase
      act(() => result.current.actions.updateDrag(5));
      expect(result.current.state.previewEnd).toBeNull();
      expect(result.current.state.phase).toBe("ready");
    });
  });

  describe("finishDrag", () => {
    it("transitions to selected with a sorted (start < end) selection", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(6));
      act(() => result.current.actions.updateDrag(2)); // dragged backwards
      act(() => result.current.actions.finishDrag(400, 200));
      expect(result.current.state.phase).toBe("selected");
      expect(result.current.state.selection).toEqual({ start: 2, end: 6 });
      expect(result.current.state.anchor).toEqual({ x: 400, y: 200 });
    });

    it("clears preview bounds on success", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(5));
      act(() => result.current.actions.finishDrag(0, 0));
      expect(result.current.state.previewStart).toBeNull();
      expect(result.current.state.previewEnd).toBeNull();
    });

    it("goes back to ready on a zero-width drag", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(3));
      // no updateDrag call → previewStart === previewEnd === 3 → end <= start
      act(() => result.current.actions.finishDrag(100, 100));
      expect(result.current.state.phase).toBe("ready");
      expect(result.current.state.selection).toBeNull();
    });

    it("is a no-op when not in selecting phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode()); // ready, not selecting
      act(() => result.current.actions.finishDrag(100, 100));
      expect(result.current.state.phase).toBe("ready");
    });
  });

  describe("setAnchorHandle", () => {
    function reachSelected() {
      const hook = renderHook(() => useTemporalTagMode());
      act(() => hook.result.current.actions.startDrag(1));
      act(() => hook.result.current.actions.updateDrag(5));
      act(() => hook.result.current.actions.finishDrag(0, 0));
      return hook;
    }

    it("updates selection bounds while in selected phase", () => {
      const { result } = reachSelected();
      act(() => result.current.actions.setAnchorHandle(2, 4));
      expect(result.current.state.selection).toEqual({ start: 2, end: 4 });
    });

    it("is a no-op when not in selected phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode()); // ready
      act(() => result.current.actions.setAnchorHandle(1, 5));
      expect(result.current.state.selection).toBeNull();
    });
  });

  describe("setLabel", () => {
    it("updates pendingLabel while in selected phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(5));
      act(() => result.current.actions.finishDrag(0, 0));
      act(() => result.current.actions.setLabel("road-clear"));
      expect(result.current.state.pendingLabel).toBe("road-clear");
    });

    it("is a no-op when not in selected phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode()); // ready
      act(() => result.current.actions.setLabel("ignored"));
      expect(result.current.state.pendingLabel).toBe("");
    });
  });

  describe("cancel", () => {
    it("transitions from selected back to ready", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.startDrag(1));
      act(() => result.current.actions.updateDrag(5));
      act(() => result.current.actions.finishDrag(0, 0));
      expect(result.current.state.phase).toBe("selected");
      act(() => result.current.actions.cancel());
      expect(result.current.state.phase).toBe("ready");
      expect(result.current.state.selection).toBeNull();
    });

    it("transitions from ready back to ready (clears any preview state)", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.enterTagMode());
      act(() => result.current.actions.cancel());
      expect(result.current.state.phase).toBe("ready");
    });

    it("is a no-op when already in idle phase", () => {
      const { result } = renderHook(() => useTemporalTagMode());
      act(() => result.current.actions.cancel());
      expect(result.current.state.phase).toBe("idle");
    });
  });
});
