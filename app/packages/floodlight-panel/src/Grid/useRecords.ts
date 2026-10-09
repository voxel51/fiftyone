import usePanelMemo from "./panelMemory";

export type Records = Map<string, number>;

export default (clear: string) =>
  usePanelMemo("records", clear, () => new Map<string, number>());
