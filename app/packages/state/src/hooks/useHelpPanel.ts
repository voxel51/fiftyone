import * as fos from "../../";
import usePanel from "./usePanel";

export default function useHelpPanel() {
  const { containerRef, open, close, toggle, state } = usePanel(
    "help",
    fos.lookerPanels,
  );

  const { isOpen, items } = state || {};
  const updateItems = (items) => (s) => ({ ...s, items });

  return {
    containerRef,
    open(items) {
      open(updateItems(items));
    },
    close,
    toggle(items) {
      toggle(updateItems(items));
    },
    items,
    isOpen,
    stateAtom: fos.lookerPanels,
  };
}
