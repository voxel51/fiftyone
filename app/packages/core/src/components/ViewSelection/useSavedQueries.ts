/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { shouldToggleBookMarkIconOnSelector } from "@fiftyone/actions";
import { useTrackEvent } from "@fiftyone/analytics";
import { getEventBus } from "@fiftyone/events";
import {
  useResetReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import type { savedViewsFragment$data } from "@fiftyone/relay";
import { toSlug } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo } from "react";

import { viewDialogOpen } from ".";
import useRefetchableSavedViews from "../../hooks/useRefetchableSavedViews";
import { viewDialogContent } from "./ViewDialog";

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
  const all: readonly SavedQuery[] = data.savedViews ?? [];
  const loaded = fos.useLoadedViewName();
  const setViewName = useSetReverbState(fos.viewName);
  const resetView = useResetReverbState(fos.view);
  const canEdit = useReverbValue(fos.canEditSavedViews);
  const setDialogOpen = useSetReverbState(viewDialogOpen);
  const setDialogContent = useSetReverbState(viewDialogContent);
  const resetDialogContent = useResetReverbState(viewDialogContent);
  const trackEvent = useTrackEvent();

  // Nothing to save: the root view, with no filters beyond it
  const bookmarkable = useReverbValue(shouldToggleBookMarkIconOnSelector);
  const view = useReverbValue(fos.view);
  const extended = useReverbValue(fos.extendedStages);
  const empty = !bookmarkable && !view?.length && extended?.length > 2;

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

  const load = useCallback(
    (query: SavedQuery) => {
      setViewName(query.slug);
      trackEvent("select_saved_view");
    },
    [setViewName, trackEvent],
  );

  const create = useCallback(() => {
    resetDialogContent();
    setDialogOpen(true);
  }, [resetDialogContent, setDialogOpen]);

  const edit = useCallback(
    (query: SavedQuery) => {
      setDialogContent({
        color: query.color || "",
        description: query.description || "",
        isCreating: false,
        name: query.name,
      });
      setDialogOpen(true);
    },
    [setDialogContent, setDialogOpen],
  );

  const onEditSuccess = useCallback(
    (saved: { slug: string }, reload?: boolean) => {
      refetch(
        { name: datasetName },
        {
          fetchPolicy: "network-only",
          onComplete: () => {
            if (saved && reload) {
              setViewName(saved.slug);
              trackEvent("created_saved_view");
            }
          },
        },
      );
    },
    [datasetName, refetch, setViewName, trackEvent],
  );

  const onDeleteSuccess = useCallback(
    (deleted: string) => {
      refetch(
        { name: datasetName },
        {
          fetchPolicy: "network-only",
          onComplete: () => {
            if (loaded && toSlug(loaded) === toSlug(deleted)) resetView();
          },
        },
      );
    },
    [datasetName, loaded, refetch, resetView],
  );

  return {
    all,
    shown,
    loaded,
    canEdit: canEdit.enabled === true,
    cannotEditReason: canEdit.message,
    canSave: canEdit.enabled === true && !empty,
    load,
    clear: resetView,
    create,
    edit,
    onEditSuccess,
    onDeleteSuccess,
  };
}
