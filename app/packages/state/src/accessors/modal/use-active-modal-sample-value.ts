/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Sidebar entry value reader for the modal's active sample. The single hook
 * here, {@link useActiveModalSampleValue}, pulls a single field value out of the modal
 * sidebar sample and surfaces a {@link LOADING} sentinel while the underlying
 * selector is unresolved or transiently absent (sparse / jagged group
 * slices). Other errors bubble.
 *
 * @module accessors/modal/use-active-modal-sample-value
 */

import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { activeModalSidebarSample } from "../../recoil/groups";
import { GroupSampleNotFound } from "../../recoil/modal";
import { field, isOfDocumentFieldList } from "../../recoil/schema";
import { pullSidebarValue } from "../../recoil/sidebar";
import { useAssertedRecoilValue } from "../../recoil/utils";

/**
 * Sentinel returned by {@link useActiveModalSampleValue} when no real value is
 * available yet. Returned in two cases:
 *
 * 1. The active modal sidebar sample is still loading.
 * 2. The sample failed with {@link GroupSampleNotFound} — sparse / jagged
 *    groups can legitimately lack a sample on the active slice; consumers
 *    should render a placeholder rather than crashing.
 *
 * Other errors (including plain `SampleNotFound`) still bubble — they
 * indicate a real problem, not a transient loading state.
 *
 * Compare with `=== LOADING` and typically render a loading placeholder.
 */
export const LOADING = Symbol("active-modal-sample-value:loading");

export type Loading = typeof LOADING;

/**
 * Reads a single field value at `path` from the active modal sidebar sample.
 *
 * @typeParam T - Expected runtime type of the field at `path`.
 * @param path - Dot-separated field path on the sidebar sample (e.g.
 *   `"ground_truth.label"`).
 * @returns The resolved value, or {@link LOADING} when the sample is
 *   unresolved or transiently absent for the active slice.
 * @throws Any non-{@link GroupSampleNotFound} error from the underlying
 *   loadable (e.g. plain `SampleNotFound` or a thrown selector error).
 */
export const useActiveModalSampleValue = <T>(path: string): T | Loading => {
  const keys = path.split(".");
  const loadable = useRecoilValueLoadable(activeModalSidebarSample);
  const resolvedField = useAssertedRecoilValue(field(keys[0]));
  const isList = useRecoilValue(isOfDocumentFieldList(path));

  if (loadable.state === "loading") {
    return LOADING;
  }

  if (loadable.state === "hasError") {
    if (loadable.contents instanceof GroupSampleNotFound) {
      return LOADING;
    }
    throw loadable.contents;
  }

  return pullSidebarValue(resolvedField, keys, loadable.contents, isList) as T;
};
