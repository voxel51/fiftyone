/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Which similarity index a quick search runs with, given where the user is
 * standing. A patches view can only be ranked by a patches index on the same
 * field — searching it with a sample-level index forces the server to
 * flatten the view, silently dropping the `ToPatches` the user is inside.
 * So: an explicit pick always wins; otherwise a view standing in patches
 * prefers the first (recency-ordered) index on that field; otherwise the
 * first index.
 */

import type { PromptableSimilarityIndex } from "@fiftyone/state";
import type { SerializedStage } from "./state";

/**
 * The field the view's LAST `ToPatches` stage extracts, or null when the
 * view does not stand in patches.
 */
export const patchesFieldOfView = (
  view: readonly SerializedStage[],
): string | null => {
  for (let i = view.length - 1; i >= 0; i--) {
    const stage = view[i];
    if (!stage._cls.endsWith(".ToPatches")) continue;

    const field = Object.fromEntries(stage.kwargs ?? [])["field"];
    return typeof field === "string" ? field : null;
  }
  return null;
};

/**
 * The index the quick search will use. `indexes` arrive recency-ordered, so
 * "first match" is also "most recently used match".
 */
export const resolveSearchIndex = (
  indexes: readonly PromptableSimilarityIndex[],
  explicitKey: string | null,
  viewPatchesField: string | null,
): PromptableSimilarityIndex | undefined => {
  const explicit = indexes.find((index) => index.key === explicitKey);
  if (explicit) return explicit;

  if (viewPatchesField) {
    const patches = indexes.find(
      (index) => index.patchesField === viewPatchesField,
    );
    if (patches) return patches;
  }

  return indexes[0];
};
