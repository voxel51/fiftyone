import { LABEL_LIST } from "@fiftyone/utilities";
import copyToClipboard from "copy-to-clipboard";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "../../";
import usePanel from "./usePanel";

const LIST_KEYS = Object.values(LABEL_LIST);

/**
 * Removes schema-policy-hidden fields and attributes from a sample
 * before display. Hidden FIELDS are normally already stripped
 * server-side (ExcludeFields); hidden ATTRIBUTES are display-level
 * policy, so the JSON panel must redact them itself. Pure — operates
 * on a JSON deep copy.
 */
export const redactSample = (
  sample: object,
  excludedFields: string[],
  excludedAttrs: string[],
) => {
  if (!excludedFields.length && !excludedAttrs.length) {
    return sample;
  }
  const clone = JSON.parse(JSON.stringify(sample));

  const resolveTargets = (fieldPath: string): unknown[] => {
    if (fieldPath.startsWith("frames.") && Array.isArray(clone.frames)) {
      const key = fieldPath.slice("frames.".length);
      return clone.frames.map((frame: unknown) =>
        frame && typeof frame === "object" ? frame[key] : undefined,
      );
    }
    return [clone[fieldPath]];
  };

  for (const fieldPath of excludedFields) {
    if (fieldPath.startsWith("frames.") && Array.isArray(clone.frames)) {
      const key = fieldPath.slice("frames.".length);
      for (const frame of clone.frames) {
        if (frame && typeof frame === "object") delete frame[key];
      }
    } else {
      delete clone[fieldPath];
    }
  }

  for (const attrPath of excludedAttrs) {
    const idx = attrPath.lastIndexOf(".");
    if (idx <= 0) continue;
    const fieldPath = attrPath.slice(0, idx);
    const attr = attrPath.slice(idx + 1);
    const strip = (label: unknown) => {
      if (label && typeof label === "object") {
        delete (label as Record<string, unknown>)[attr];
      }
    };
    for (const target of resolveTargets(fieldPath)) {
      if (!target || typeof target !== "object") continue;
      let isList = false;
      for (const key of LIST_KEYS) {
        const list = (target as Record<string, unknown>)[key];
        if (Array.isArray(list)) {
          list.forEach(strip);
          isList = true;
        }
      }
      if (!isList) strip(target);
    }
  }

  return clone;
};

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
    fos.lookerPanels,
  );

  const { sample, isOpen } = state || {};
  const excludedFields = useRecoilValue(fos.activeSchemaExclusions);
  const excludedAttrs = useRecoilValue(fos.activeSchemaAttrExclusions);
  const json = useMemo(
    () =>
      sample
        ? JSON.stringify(
            redactSample(sample, excludedFields ?? [], excludedAttrs ?? []),
            null,
            2,
          )
        : null,
    [sample, excludedFields, excludedAttrs],
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
