import { useRef } from "react";
import { useRecoilState } from "recoil";
import { useOutsideClick } from "@fiftyone/state";

export default function usePanel(name, atom) {
  const containerRef = useRef<HTMLElement>();
  const [state, setFullState] = useRecoilState(atom);
  const setState = (update) =>
    setFullState((fullState) => ({
      ...fullState,
      [name]: update(fullState[name]),
    }));
  function close() {
    setState((s) => ({ ...s, isOpen: false }));
  }
  useOutsideClick(containerRef, (e) => {
    const target = e.target as HTMLElement;
    const isPanelButton = target.getAttribute("data-for-panel") === name;
    if (!isPanelButton) close();
  });

  function updateClosed(panels, shouldUpdate) {
    const updated = {};
    if (!shouldUpdate) return { ...panels };
    for (const [panelName, state] of Object.entries<object>(panels)) {
      updated[panelName] = { ...state, isOpen: false };
    }
    return updated;
  }

  return {
    containerRef,
    open(updater) {
      if (!updater) updater = (s) => s;
      setFullState((s) => ({
        ...updateClosed(s, true),
        [name]: updater({
          ...s[name],
          isOpen: true,
        }),
      }));
    },
    close,
    toggle(updater) {
      if (!updater) updater = (s) => s;
      setFullState((s) => ({
        ...updateClosed(s, !s[name].isOpen),
        [name]: updater({
          ...s[name],
          isOpen: !s[name].isOpen,
        }),
      }));
    },
    state: state[name],
  };
}
