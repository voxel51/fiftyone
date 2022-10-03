import { useState, useMemo, useEffect, createRef, useRef } from "react";
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
  const containerRef = useRef();
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

  function handleClick() {
    close();
  }

  fos.useOutsideClick(containerRef, () => close());

  return {
    containerRef,
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
