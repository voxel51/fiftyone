import { Sample } from "@fiftyone/looker/src/state";
import { useState, useMemo, useEffect } from "react";
import { atom, useRecoilState } from "recoil";
import copyToClipboard from "copy-to-clipboard";
import highlightJSON from "json-format-highlight";
import * as fos from "../../";

type JSONPanelState = {
  sample?: Sample;
  isOpen: boolean;
};

export const JSON_COLORS = {
  keyColor: "rgb(138, 138, 138)",
  numberColor: "rgb(225, 100, 40)",
  stringColor: "rgb(238, 238, 238)",
  nullColor: "rgb(225, 100, 40)",
  trueColor: "rgb(225, 100, 40)",
  falseColor: "rgb(225, 100, 40)",
};

export default function useJSONPanel() {
  const [state, setFullState] = useRecoilState(fos.lookerPanels);
  const { sample, isOpen } = state.json || {};
  const setState = (update) =>
    setFullState((fullState) => ({
      ...fullState,
      json: update(fullState.json),
    }));
  const json = useMemo(
    () => (sample ? JSON.stringify(sample, null, 2) : null),
    [sample]
  );
  const jsonHTML = useMemo(
    () => ({ __html: highlightJSON(json, JSON_COLORS) }),
    [json]
  );
  function close() {
    setState((s) => ({ ...s, isOpen: false }));
  }

  function handleClick() {
    close();
  }

  useEffect(() => {
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return {
    open(sample) {
      setFullState((s) => ({
        ...s,
        json: {
          sample,
          isOpen: true,
        },
        help: {
          ...s.help,
          isOpen: false,
        },
      }));
    },
    close,
    toggle(sample) {
      setFullState((s) => ({
        ...s,
        help: {
          ...s.help,
          isOpen: false,
        },
        json: {
          ...s.json,
          sample,
          isOpen: !s.json.isOpen,
        },
      }));
    },
    copy() {
      copyToClipboard(json);
    },
    isOpen,
    sample,
    json,
    jsonHTML,
    stateAtom: fos.lookerPanels,
  };
}
