/**
 * Custom-schema visibility moves: the modal footer's "Move N to
 * hidden/active fields" over the checkbox selection. Kept out of
 * `hooks.ts` on purpose — that module is imported everywhere, and this
 * one needs the schema-doc layer (`useSchemaDocs`), which reads
 * manager atoms that unrelated test mocks of `../state` don't define.
 */

import { useNotification } from "@fiftyone/state";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { selectedActiveFields, selectedHiddenFields } from "./state";
import {
  PROTECTED_PATHS,
  useManagerDocMode,
  withFieldTier,
  withoutFieldTier,
} from "./useSchemaDocs";

/**
 * Moves the selected ACTIVE fields of the open custom schema to Hidden:
 * an explicit `hidden` tier per field, persisted to the doc. Protected
 * fields are skipped (they can never be hidden).
 */
export const useHideSelectedFields = () => {
  const docMode = useManagerDocMode();
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const setMessage = useNotification();

  return useCallback(() => {
    if (!docMode) return;
    const { docId, doc, setDoc, api } = docMode;
    const paths = Array.from(selected).filter((p) => !PROTECTED_PATHS.has(p));
    if (!paths.length) return;
    let visibility = doc.visibility;
    for (const path of paths) {
      visibility = withFieldTier(visibility, path, "hidden");
    }
    setDoc({ ...doc, visibility });
    setSelected(new Set());
    api.updateDoc(docId, { visibility }).catch(() => {
      setDoc(doc);
      setMessage({ msg: "Failed to hide fields", variant: "error" });
    });
    setMessage({
      msg: `${paths.length} field${paths.length > 1 ? "s" : ""} moved to hidden fields`,
      variant: "success",
    });
  }, [docMode, selected, setSelected, setMessage]);
};

/**
 * Moves the selected HIDDEN fields of the open custom schema back to
 * Active: the explicit tier is dropped so it derives again (annotate
 * when set up, explore-only otherwise) — pinned to an explicit
 * `explore` when the doc's default would hide it again.
 */
export const useUnhideSelectedFields = () => {
  const docMode = useManagerDocMode();
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const setMessage = useNotification();

  return useCallback(() => {
    if (!docMode) return;
    const { docId, doc, setDoc, api } = docMode;
    const paths = Array.from(selected);
    if (!paths.length) return;
    let visibility = doc.visibility;
    for (const path of paths) {
      visibility = withoutFieldTier(visibility, path);
      if (!(path in doc.label_schema) && visibility.default === "hidden") {
        visibility = withFieldTier(visibility, path, "explore");
      }
    }
    setDoc({ ...doc, visibility });
    setSelected(new Set());
    api.updateDoc(docId, { visibility }).catch(() => {
      setDoc(doc);
      setMessage({ msg: "Failed to unhide fields", variant: "error" });
    });
    setMessage({
      msg: `${paths.length} field${paths.length > 1 ? "s" : ""} moved to active fields`,
      variant: "success",
    });
  }, [docMode, selected, setSelected, setMessage]);
};
