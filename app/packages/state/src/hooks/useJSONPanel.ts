import { Sample } from "@fiftyone/looker/src/state";
import { useState, useMemo, useEffect } from "react";
import { atom, useRecoilState } from "recoil";
import copyToClipboard from "copy-to-clipboard";
import highlightJSON from "json-format-highlight";

type JSONPanelState = {
  sample?: Sample;
  isOpen: boolean;
};
const jsonPanelState = atom<JSONPanelState>({
  key: "jsonPanelState",
  default: { isOpen: false },
});

export const JSON_COLORS = {
  keyColor: "rgb(138, 138, 138)",
  numberColor: "rgb(225, 100, 40)",
  stringColor: "rgb(238, 238, 238)",
  nullColor: "rgb(225, 100, 40)",
  trueColor: "rgb(225, 100, 40)",
  falseColor: "rgb(225, 100, 40)",
};

export default function useJSONPanel() {
  const [{ isOpen, sample }, setState] = useRecoilState(jsonPanelState);
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

  function handleEscape(e) {
    if (e.key === "Escape") close();
  }

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return {
    open(sample) {
      setState((s) => ({ ...s, sample, isOpen: true }));
    },
    close,
    toggle(sample) {
      setState((s) => {
        if (s.isOpen) {
          return { ...s, sample: null, isOpen: false };
        }
        return { ...s, sample, isOpen: true };
      });
    },
    copy() {
      copyToClipboard(json);
    },
    isOpen,
    sample,
    json,
    jsonHTML,
  };
}
