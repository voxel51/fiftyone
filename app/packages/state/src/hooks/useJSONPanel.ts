import { useMemo } from "react";
import copyToClipboard from "copy-to-clipboard";
import highlightJSON from "json-format-highlight";
import * as fos from "../../";
import usePanel from "./usePanel";

export const JSON_COLORS = {
  keyColor: "var(--joy-palette-text-tertiary)",
  numberColor: "rgb(225, 100, 40)",
  stringColor: "var(--joy-palette-text-secondary)",
  nullColor: "rgb(225, 100, 40)",
  trueColor: "rgb(225, 100, 40)",
  falseColor: "rgb(225, 100, 40)",
};

export default function useJSONPanel() {
  const { containerRef, open, close, toggle, state } = usePanel(
    "json",
    fos.lookerPanels
  );

  const { sample, isOpen } = state || {};
  const json = useMemo(
    () => (sample ? JSON.stringify(sample, null, 2) : null),
    [sample]
  );
  const jsonHTML = useMemo(
    () => ({ __html: highlightJSON(json, JSON_COLORS) }),
    [json]
  );

  const updateSample = (sample) => (s) => ({ ...s, sample });

  return {
    containerRef,
    open(sample) {
      open(updateSample(sample));
    },
    close,
    toggle(sample) {
      toggle(updateSample(sample));
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
