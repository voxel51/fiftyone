import { useState, useMemo, useEffect } from "react";
import { atom, useRecoilState } from "recoil";

type HelpItem = {
  shortcut: string;
  title: string;
  detail: string;
};
type HelpPanelState = {
  isOpen: boolean;
  items: Array<HelpItem>;
};
const helpPanelState = atom<HelpPanelState>({
  key: "HelpPanelState",
  default: { isOpen: false, items: [] },
});

export default function useHelpPanel() {
  const [{ isOpen, items }, setState] = useRecoilState(helpPanelState);
  function close() {
    setState((s) => ({ ...s, isOpen: false }));
  }

  function handleEscape(e) {
    if (e.key === "Escape") close();
  }
  function handleClick() {
    close();
  }

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      window.addEventListener("mousedown", handleClick);
    }
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  return {
    open(items) {
      setState((s) => ({ ...s, items, isOpen: true }));
    },
    close,
    toggle(items) {
      setState((s) => {
        if (s.isOpen) {
          return { ...s, items: null, isOpen: false };
        }
        return { ...s, items, isOpen: true };
      });
    },
    items,
    isOpen,
    stateAtom: helpPanelState,
  };
}
