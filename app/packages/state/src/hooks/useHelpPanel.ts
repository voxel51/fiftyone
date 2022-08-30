import { useState, useMemo, useEffect } from "react";
import { atom, useRecoilState } from "recoil";
import * as fos from "../../";

type HelpItem = {
  shortcut: string;
  title: string;
  detail: string;
};
type HelpPanelState = {
  isOpen: boolean;
  items: Array<HelpItem>;
};

export default function useHelpPanel() {
  const [state, setFullState] = useRecoilState(fos.lookerPanels);
  const setState = (update) =>
    setFullState((fullState) => ({
      ...fullState,
      help: update(fullState.help),
    }));
  const { isOpen, items } = state.help || {};
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
      window.addEventListener("click", handleClick);
    }
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("click", handleClick);
    };
  }, [isOpen]);

  return {
    open(items) {
      setFullState((s) => ({
        ...s,
        json: {
          ...s.json,
          isOpen: false,
        },
        help: {
          ...s.help,
          items,
          isOpen: true,
        },
      }));
    },
    close,
    toggle(items) {
      setFullState((s) => ({
        ...s,
        json: {
          ...s.json,
          isOpen: false,
        },
        help: {
          ...s.help,
          items,
          isOpen: !s.help.isOpen,
        },
      }));
    },
    items,
    isOpen,
    stateAtom: fos.lookerPanels,
  };
}
