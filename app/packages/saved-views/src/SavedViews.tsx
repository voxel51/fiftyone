/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The saved-views feature: data loading, URL/selection syncing, and the
 * cmd/ctrl+S shortcut, around the selector and its create/edit dialog.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import * as fos from "@fiftyone/state";
import { Suspense, useEffect, useMemo } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { SavedViewSelector } from "./SavedViewSelector";
import ViewDialog from "./ViewDialog";
import { viewDialogContent, viewDialogOpen, viewSearchTerm } from "./state";
import useRefetchableSavedViews from "./useRefetchableSavedViews";

export interface SavedViewsProps {
  /**
   * Whether unsaved view content exists beyond `fos.view` itself (the host's
   * extended stages / bookmark state) — gates the create flow.
   */
  hasUnsavedContent: boolean;
}

function SavedViewsInner({ hasUnsavedContent }: SavedViewsProps) {
  const [selected, setSelected] = useRecoilState<fos.DatasetViewOption | null>(
    fos.selectedSavedViewState,
  );
  const datasetName = useRecoilValue(fos.datasetName);
  const canEditSavedViews = useRecoilValue(fos.canEditSavedViews);
  const setIsOpen = useSetRecoilState(viewDialogOpen);
  const [savedViewParam, setViewName] = useRecoilState(fos.viewName);
  const setEditView = useSetRecoilState(viewDialogContent);
  const resetView = useResetRecoilState(fos.view);
  const [viewSearch, setViewSearch] = useRecoilState(viewSearchTerm);

  const disabled = canEditSavedViews.enabled !== true;
  const disabledMsg = canEditSavedViews.message;

  const [data, refetch] = useRefetchableSavedViews();

  const items = useMemo(() => data.savedViews || [], [data]);

  const viewOptions = useMemo(
    () =>
      items.map(({ id, name, color, description, slug, viewStages }) => ({
        id,
        name,
        label: name,
        color,
        slug,
        description,
        viewStages,
      })),
    [items],
  );

  const searchData = useMemo(
    () =>
      viewOptions.filter(
        ({ id, label, description, slug }) =>
          id === fos.DEFAULT_SELECTED.id ||
          label?.toLowerCase().includes(viewSearch) ||
          description?.toLowerCase().includes(viewSearch) ||
          slug?.toLowerCase().includes(viewSearch),
      ),
    [viewOptions, viewSearch],
  );

  useEffect(() => {
    refetch({ name: datasetName });
  }, [datasetName]);

  useEffect(() => {
    if (
      selected &&
      selected?.id !== fos.DEFAULT_SELECTED.id &&
      searchData?.length
    ) {
      const potentialView = searchData.filter(
        (v) => v.slug === selected.slug,
      )?.[0];
      if (potentialView) {
        setSelected(potentialView as unknown as fos.DatasetViewOption);
      }
    }
  }, [searchData, selected]);

  const loadedView = useRecoilValue(fos.view);
  const isEmptyView = !loadedView?.length && !hasUnsavedContent;
  const trackEvent = useTrackEvent();

  useEffect(() => {
    if (savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.label === savedViewParam,
      )?.[0];
      if (potentialView) {
        if (selected && selected.id === potentialView.id) {
          return;
        }
        setSelected(potentialView as unknown as fos.DatasetViewOption);
      } else {
        const potentialUpdatedView = items.filter(
          (v) => v.name === savedViewParam,
        )?.[0];
        if (potentialUpdatedView) {
          refetch(
            { name: datasetName },
            {
              fetchPolicy: "network-only",
              onComplete: () => {
                setSelected({
                  ...potentialUpdatedView,
                  label: potentialUpdatedView.name,
                  slug: potentialUpdatedView.slug,
                } as unknown as fos.DatasetViewOption);
              },
            },
          );
        } else {
          // bad/old view param
          setSelected(fos.DEFAULT_SELECTED);
        }
      }
    } else {
      // no view param
      if (selected && selected.slug !== fos.DEFAULT_SELECTED.slug) {
        setSelected(fos.DEFAULT_SELECTED);
        // do not reset view to [] again; the view bar sets it once
      }
    }
  }, [savedViewParam]);

  useEffect(() => {
    const callback = (event: KeyboardEvent) => {
      if (disabled) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
        event.preventDefault();
        if (!isEmptyView) {
          setIsOpen(true);
        }
      }
    };

    document.addEventListener("keydown", callback);
    return () => {
      document.removeEventListener("keydown", callback);
    };
  }, [isEmptyView, disabled]);

  return (
    <>
      <ViewDialog
        canEdit={!disabled}
        id="saved-views"
        savedViews={items as unknown as fos.State.SavedView[]}
        hasViewContent={hasUnsavedContent}
        onEditSuccess={(
          createSavedView: fos.State.SavedView,
          reload?: boolean,
        ) => {
          refetch(
            { name: datasetName },
            {
              fetchPolicy: "network-only",
              onComplete: () => {
                if (createSavedView && reload) {
                  setViewName(createSavedView.slug);
                  setSelected({
                    ...createSavedView,
                    label: createSavedView.name,
                  });
                  trackEvent("created_saved_view");
                }
              },
            },
          );
        }}
        onDeleteSuccess={(deletedSavedViewName: string) => {
          refetch(
            { name: datasetName },
            {
              fetchPolicy: "network-only",
              onComplete: () => {
                if (selected?.label === deletedSavedViewName) {
                  resetView();
                }
              },
            },
          );
        }}
      />
      <SavedViewSelector
        id="saved-views"
        items={searchData as unknown as fos.DatasetViewOption[]}
        selected={selected}
        onSelect={(item) => {
          setSelected(item);
          setViewName(item.slug);
          trackEvent("select_saved_view");
        }}
        onClear={() => {
          setSelected(fos.DEFAULT_SELECTED);
          resetView();
        }}
        onEdit={(item) => {
          setEditView({
            color: item.color || "",
            description: item.description || "",
            isCreating: false,
            name: item.label,
          });
          setIsOpen(true);
        }}
        onCreate={() => setIsOpen(true)}
        search={{
          value: viewSearch,
          onSearch: setViewSearch,
        }}
        disabled={disabled}
        disabledMsg={disabledMsg}
        isEmptyView={isEmptyView}
      />
    </>
  );
}

export default function SavedViews(props: SavedViewsProps) {
  return (
    <Suspense fallback="Loading saved views...">
      <SavedViewsInner {...props} />
    </Suspense>
  );
}
