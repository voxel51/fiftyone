import { useMemo } from "react";
import copyToClipboard from "copy-to-clipboard";
import * as fos from "../../";
import usePanel from "./usePanel";

export const JSON_COLORS = {
  keyColor: "var(--fo-palette-text-tertiary)",
  numberColor: "rgb(225, 100, 40)",
  stringColor: "var(--fo-palette-text-secondary)",
  nullColor: "rgb(225, 100, 40)",
  trueColor: "rgb(225, 100, 40)",
  falseColor: "rgb(225, 100, 40)",
};

/**
 * Manage the JSON panel state and events.
 *
 * @example
 * ```ts
 * function MyComponent() {
 *   const jsonPanel = useJSONPanel();
 *
 *   return jsonPanel.isOpen && (
 *      <JSONPanel
 *        containerRef={jsonPanel.containerRef}
 *        onClose={() => jsonPanel.close()}
 *        onCopy={() => jsonPanel.copy()}
 *      />
 *    )
 * }
 */
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
    stateAtom: fos.lookerPanels,
  };
}
