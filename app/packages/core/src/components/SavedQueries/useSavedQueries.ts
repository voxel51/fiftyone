/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Domain hooks for Saved queries. Every read and write goes through the
 * saved view records, fragment and mutations, so the SDK, links, and older
 * clients see the same objects.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import useRefetchableSavedViews from "../../hooks/useRefetchableSavedViews";
import {
  useGridSelectionDataset,
  useSelectionBoundary,
  useSelectionBucketCaptures,
} from "@fiftyone/state/src/selection";
import {
  editedInfo,
  type DefinitionParts,
  type SavedQuery,
  type SavedQueryDraft,
} from "./model";

/** The dataset's saved queries and the one loaded in the working view. */
export function useSavedQueries() {
  const [data, refetch] = useRefetchableSavedViews();
  const datasetName = fos.useCurrentDatasetName();
  const loadedName = fos.useLoadedSavedViewName();
  const queries = useMemo(
    () => (data.savedViews ?? []) as readonly SavedQuery[],
    [data],
  );
  const loaded = useMemo(
    () => queries.find((query) => query.name === loadedName) ?? null,
    [queries, loadedName],
  );

  /** Re-reads the list, e.g. for queries saved from the SDK meanwhile. */
  const refresh = useCallback(
    (onComplete?: () => void) => {
      if (!datasetName) return;
      refetch(
        { name: datasetName },
        { fetchPolicy: "network-only", onComplete: () => onComplete?.() },
      );
    },
    [datasetName, refetch],
  );

  return { queries, loaded, loadedName, refresh };
}

/** Who may save, edit, and delete queries; loading stays open to viewers. */
export function useSavedQueryPermissions() {
  const permission = fos.useSavedViewEditPermission();
  const locked = false;
  return {
    canEdit: permission.enabled === true,
    editDisabledReason:
      permission.message ?? "Saving queries requires dataset edit permission",
    locked,
  };
}

/**
 * What saving now would capture. Sidebar filters, sorting, field visibility
 * and plot selections compile into the saved stages; the tray selection only
 * joins them when the user asks, and only where its IDs are durable. The
 * selection is every section's picks together.
 */
export function useSaveQueryDefinition(includeSelection: boolean) {
  const view = fos.useView();
  const {
    filters,
    sort,
    similarity,
    fieldVisibility,
    extendedSelection,
    overrideStage,
  } = fos.useSavedViewTransientState();
  const [selected] = fos.useLegacySelectedSamples();
  const { conversion, domainId, unit } = useGridSelectionDataset();
  const sections = useSelectionBucketCaptures(domainId);
  // Patches, frames and clips views regenerate their IDs, so a selection
  // made there cannot be saved as a durable stage
  const selectionSavable = conversion === null;
  const parts: DefinitionParts = {
    stages: view?.length ?? 0,
    filters,
    sort: Boolean(sort),
    similarity: Boolean(similarity),
    fieldVisibility: Boolean(fieldVisibility?.kwargs?.field_names?.length),
    resultSelection: Boolean(
      overrideStage ||
      extendedSelection?.spatialSelection ||
      extendedSelection?.selection?.length,
    ),
    selectedSamples: includeSelection && selectionSavable ? selected.size : 0,
    selectionUnit: unit,
  };
  return {
    parts,
    selectionSize: selected.size,
    selectionSections: [...sections.values()].filter(
      (section) => section.size > 0,
    ).length,
    selectionSavable,
    selectionUnit: unit,
  };
}

/**
 * Whether the grid is scoped to a subset, and how a query saved now relates
 * to it. A plain subset scope is applied beside the view and is not part of a
 * saved definition; an exact-entity subset lives in the view's conversion
 * stage, so a query saved there keeps referring to it.
 */
export function useSaveQueryScope() {
  const { domainId, subsetViewId } = useGridSelectionDataset();
  const [boundary] = useSelectionBoundary(domainId);
  if (!subsetViewId && !boundary.subsetId) return null;
  return { saved: Boolean(subsetViewId) };
}

type Callbacks<T> = {
  onSuccess?: (value: T) => void;
  onError: (error: Error) => void;
};

/** Saves the working view as a new query and loads it. */
export function useCreateSavedQuery() {
  const { handleCreateSavedView, isCreatingSavedView } = fos.useSavedViews();
  const { refresh } = useSavedQueries();
  const view = fos.useView();
  const [selected] = fos.useLegacySelectedSamples();
  const setViewName = fos.useSetSavedViewName();
  const trackEvent = useTrackEvent();

  const create = useCallback(
    (
      { name, description, color }: SavedQueryDraft,
      includeSelection: boolean,
      { onSuccess, onError }: Callbacks<SavedQuery>,
    ) =>
      handleCreateSavedView(
        name.trim(),
        description.trim(),
        color,
        view,
        (saved) => {
          if (!saved) {
            onError(new Error("The query was not saved"));
            return;
          }
          refresh(() => {
            setViewName(saved.slug);
            trackEvent("created_saved_view", { surface: "saved_queries" });
            onSuccess?.(saved as SavedQuery);
          });
        },
        {
          onError,
          // An expiring tray capture never becomes part of a durable query:
          // only the IDs of samples the user chose to include are saved
          sampleIds: includeSelection ? [...selected.keys()] : [],
        },
      ),
    [handleCreateSavedView, view, selected, refresh, setViewName, trackEvent],
  );

  return { create, creating: isCreatingSavedView };
}

/** Loads a query's saved definition into the working view. */
export function useLoadSavedQuery() {
  const setViewName = fos.useSetSavedViewName();
  const trackEvent = useTrackEvent();
  return useCallback(
    (query: SavedQuery) => {
      setViewName(query.slug);
      trackEvent("select_saved_view", { surface: "saved_queries" });
    },
    [setViewName, trackEvent],
  );
}

/**
 * Edits a query's name, description and color. The definition is never
 * touched here: replacing it means saving the working view as a query.
 */
export function useEditSavedQuery() {
  const { handleUpdateSavedView, isUpdatingSavedView } = fos.useSavedViews();
  const { refresh, loaded } = useSavedQueries();
  const setViewName = fos.useSetSavedViewName();

  const edit = useCallback(
    (
      query: SavedQuery,
      draft: SavedQueryDraft,
      { onSuccess, onError }: Callbacks<SavedQuery>,
    ) => {
      const info = editedInfo(query, draft);
      handleUpdateSavedView(
        query.name,
        info.name,
        info.description,
        info.color,
        (updated) => {
          if (!updated) {
            onError(new Error("The query was not updated"));
            return;
          }
          refresh(() => {
            // A loaded query's link follows its new slug
            if (loaded?.id === query.id && updated.slug !== query.slug) {
              setViewName(updated.slug);
            }
            onSuccess?.(updated as SavedQuery);
          });
        },
        { onError },
      );
    },
    [handleUpdateSavedView, refresh, loaded, setViewName],
  );

  return { edit, editing: isUpdatingSavedView };
}

/**
 * Deletes a query. Subsets captured from its results are separate records
 * and stay as they are.
 */
export function useDeleteSavedQuery() {
  const { handleDeleteView, isDeletingSavedView } = fos.useSavedViews();
  const { refresh, loaded } = useSavedQueries();
  const resetView = fos.useResetView();

  const remove = useCallback(
    (query: SavedQuery, { onSuccess, onError }: Callbacks<void>) => {
      const wasLoaded = loaded?.id === query.id;
      handleDeleteView(
        query.name,
        () =>
          refresh(() => {
            if (wasLoaded) resetView();
            onSuccess?.();
          }),
        { onError },
      );
    },
    [handleDeleteView, refresh, loaded, resetView],
  );

  return { remove, deleting: isDeletingSavedView };
}
