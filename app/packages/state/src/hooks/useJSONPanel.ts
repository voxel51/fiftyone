import { useMemo } from "react";
import copyToClipboard from "copy-to-clipboard";
import * as fos from "../../";
import usePanel from "./usePanel";
import { cssVar } from "@voxel51/voodo";

export const JSON_COLORS = {
  keyColor: cssVar.color.text.tertiary,
  numberColor: cssVar.color.code.text,
  stringColor: cssVar.color.text.secondary,
  nullColor: cssVar.color.code.text,
  trueColor: cssVar.color.code.text,
  falseColor: cssVar.color.code.text,
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
    fos.lookerPanels,
  );

  const { sample, isOpen } = state || {};
  const json = useMemo(
    () => (sample ? JSON.stringify(sample, null, 2) : null),
    [sample],
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
