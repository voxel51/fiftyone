/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { getEventBus } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import type { savedViewsFragment$data } from "@fiftyone/relay";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo } from "react";

import { useViewDialog } from ".";
import useRefetchableSavedViews from "../../hooks/useRefetchableSavedViews";

/** e2e specs wait on the list a refetch or search leaves on screen */
type SavedQueriesE2EEvents = {
  "e2e:saved-views:listed": { count: number; search: string };
};

export type SavedQuery = savedViewsFragment$data["savedViews"][number];

/**
 * A saved query is a search when its view is a text similarity search, and a
 * built view otherwise.
 */
export const kindOf = (query: SavedQuery): "search" | "stages" =>
  query.viewStages.some((stage) => {
    const { _cls, kwargs } = (
      typeof stage === "string" ? JSON.parse(stage) : stage
    ) as { _cls?: string; kwargs?: [string, unknown][] };
    return (
      _cls === "fiftyone.core.stages.SortBySimilarity" &&
      kwargs?.some(
        ([name, value]) => name === "query" && typeof value === "string",
      )
    );
  })
    ? "search"
    : "stages";

/**
 * The dataset's saved queries (saved views) and what can be done with them:
 * loading one, saving the current query, and opening one's editor.
 */
export default function useSavedQueries(search: string) {
  const datasetName = fos.useCurrentDatasetName();
  const [data, refetch] = useRefetchableSavedViews();
  const all = useMemo<readonly SavedQuery[]>(
    () => data.savedViews ?? [],
    [data],
  );
  const loaded = fos.useLoadedViewName();
  const controls = fos.useSavedViewControls();
  const dialog = useViewDialog();
  const trackEvent = useTrackEvent();

  useEffect(() => {
    refetch({ name: datasetName });
  }, [datasetName]); // eslint-disable-line react-hooks/exhaustive-deps -- the refetch identity changes per render

  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all.filter(
        ({ name, description, slug }) =>
          name.toLowerCase().includes(term) ||
          description?.toLowerCase().includes(term) ||
          slug.toLowerCase().includes(term),
      ),
    [all, term],
  );

  useEffect(() => {
    getEventBus<SavedQueriesE2EEvents>().dispatch("e2e:saved-views:listed", {
      count: shown.length,
      search,
    });
  }, [shown, search]);

  const { load: loadSlug, clear } = controls;
  const load = useCallback(
    (query: SavedQuery) => {
      loadSlug(query.slug);
      trackEvent("select_saved_view");
    },
    [loadSlug, trackEvent],
  );

  const edit = useCallback(
    (query: SavedQuery) =>
      dialog.edit({
        color: query.color || "",
        description: query.description || "",
        name: query.name,
      }),
    [dialog],
  );

  const onEditSuccess = useCallback(
    (saved: { slug: string }, reload?: boolean) => {
      refetch(
        { name: datasetName },
        {
          fetchPolicy: "network-only",
          onComplete: () => {
            if (saved && reload) {
              loadSlug(saved.slug);
              trackEvent("created_saved_view");
            }
          },
        },
      );
    },
    [datasetName, loadSlug, refetch, trackEvent],
  );

  const onDeleteSuccess = useCallback(
    (deleted: string) => {
      refetch(
        { name: datasetName },
        {
          fetchPolicy: "network-only",
          onComplete: () => {
            if (loaded && toSlug(loaded) === toSlug(deleted)) clear();
          },
        },
      );
    },
    [datasetName, loaded, refetch, clear],
  );

  return {
    all,
    shown,
    loaded,
    canEdit: controls.canEdit,
    cannotEditReason: controls.cannotEditReason,
    canSave: controls.canEdit,
    load,
    clear,
    create: dialog.create,
    edit,
    onEditSuccess,
    onDeleteSuccess,
  };
}
