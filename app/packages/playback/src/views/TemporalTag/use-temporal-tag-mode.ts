import { useCallback, useState } from "react";

export type TemporalTagPhase = "idle" | "ready" | "selecting" | "selected";

export interface TemporalTagSelection {
  readonly start: number;
  readonly end: number;
}

export interface TemporalTagPopupAnchor {
  readonly x: number;
  readonly y: number;
}

export interface TemporalTagModeState {
  readonly phase: TemporalTagPhase;
  readonly selection: TemporalTagSelection | null;
  readonly previewEnd: number | null;
  readonly previewStart: number | null;
  readonly anchor: TemporalTagPopupAnchor | null;
  readonly pendingLabel: string;
}

export interface TemporalTagModeActions {
  enterTagMode(): void;
  exitTagMode(): void;
  startDrag(startTime: number): void;
  updateDrag(endTime: number, startTime?: number): void;
  finishDrag(anchorX: number, anchorY: number): void;
  setAnchorHandle(start: number, end: number): void;
  setLabel(label: string): void;
  cancel(): void;
}

const INITIAL_STATE: TemporalTagModeState = {
  phase: "idle",
  selection: null,
  previewEnd: null,
  previewStart: null,
  anchor: null,
  pendingLabel: "",
};

export function useTemporalTagMode(): {
  state: TemporalTagModeState;
  actions: TemporalTagModeActions;
} {
  const [state, setState] = useState<TemporalTagModeState>(INITIAL_STATE);

  const enterTagMode = useCallback(() => {
    setState((s) =>
      s.phase === "idle" ? { ...INITIAL_STATE, phase: "ready" } : s
    );
  }, []);

  const exitTagMode = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const startDrag = useCallback((startTime: number) => {
    setState({
      ...INITIAL_STATE,
      phase: "selecting",
      previewStart: startTime,
      previewEnd: startTime,
    });
  }, []);

  const updateDrag = useCallback((endTime: number, startTime?: number) => {
    setState((s) => {
      if (s.phase !== "selecting") return s;
      return {
        ...s,
        previewEnd: endTime,
        previewStart: startTime !== undefined ? startTime : s.previewStart,
      };
    });
  }, []);

  const finishDrag = useCallback((anchorX: number, anchorY: number) => {
    setState((s) => {
      if (s.phase !== "selecting") return s;
      const start = Math.min(s.previewStart ?? 0, s.previewEnd ?? 0);
      const end = Math.max(s.previewStart ?? 0, s.previewEnd ?? 0);
      if (end <= start) {
        // Zero-width drag — go back to ready
        return { ...INITIAL_STATE, phase: "ready" };
      }
      return {
        ...s,
        phase: "selected",
        selection: { start, end },
        anchor: { x: anchorX, y: anchorY },
        previewStart: null,
        previewEnd: null,
        pendingLabel: "",
      };
    });
  }, []);

  const setAnchorHandle = useCallback((start: number, end: number) => {
    setState((s) => {
      if (s.phase !== "selected" || !s.selection) return s;
      return { ...s, selection: { start, end } };
    });
  }, []);

  const setLabel = useCallback((label: string) => {
    setState((s) =>
      s.phase === "selected" ? { ...s, pendingLabel: label } : s
    );
  }, []);

  const cancel = useCallback(() => {
    setState((s) =>
      s.phase === "idle" ? s : { ...INITIAL_STATE, phase: "ready" }
    );
  }, []);

  return {
    state,
    actions: {
      enterTagMode,
      exitTagMode,
      startDrag,
      updateDrag,
      finishDrag,
      setAnchorHandle,
      setLabel,
      cancel,
    },
  };
}
