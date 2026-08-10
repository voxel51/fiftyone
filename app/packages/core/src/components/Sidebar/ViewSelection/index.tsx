import { useTrackEvent } from "@fiftyone/analytics";
import { useKeyBinding } from "@fiftyone/keymap";
import { default as useRefetchableSavedViews } from "../../../hooks/useRefetchableSavedViews";
import * as fos from "@fiftyone/state";
import { Suspense, useEffect, useMemo } from "react";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { shouldToggleBookMarkIconOnSelector } from "../../Grid/Actions/SaveFilters";
import SavedViewsSelection from "./SavedViewsSelection";
import ViewDialog, { viewDialogContent } from "./ViewDialog";
import { Box } from "./styledComponents";

export const viewSearchTerm = atom<string>({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom<boolean>({
  key: "viewDialogOpen",
  default: false,
});

export interface DatasetView {
  id: string;
  name: string;
  slug: string;
  datasetId: string;
  color: string | null;
  description: string | null;
  viewStages: readonly string[];
}

export default function ViewSelection() {
  const [selected, setSelected] = useRecoilState<fos.DatasetViewOption | null>(
    fos.selectedSavedViewState,
  );
  const datasetName = useRecoilValue(fos.datasetName);
  const canEditSavedViews = useRecoilValue(fos.canEditSavedViews);
  const setIsOpen = useSetRecoilState(viewDialogOpen);
  const [savedViewParam, setViewName] = useRecoilState(fos.viewName);
  const setEditView = useSetRecoilState(viewDialogContent);
  const resetView = useResetRecoilState(fos.view);
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

  const disabled = canEditSavedViews.enabled !== true;
  const disabledMsg = canEditSavedViews.message;

  const [data, refetch] = useRefetchableSavedViews();

  const items = useMemo(() => data.savedViews || [], [data]);

  const viewOptions = useMemo(
    () => [
      ...items.map(({ id, name, color, description, slug, viewStages }) => ({
        id,
        name,
        label: name,
        color,
        slug,
        description,
        viewStages,
      })),
    ],
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
        setSelected(potentialView as fos.DatasetViewOption);
      }
    }
  }, [searchData, selected]);

  const loadedView = useRecoilValue(fos.view);
  const bookmarkIconOn = useRecoilValue(shouldToggleBookMarkIconOnSelector);
  const extendedStagesVal = useRecoilValue(fos.extendedStages);
  const isEmptyView =
    !bookmarkIconOn && !loadedView?.length && extendedStagesVal?.length > 2;
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
        setSelected(potentialView as fos.DatasetViewOption);
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
                });
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
        // do not reset view to [] again. The viewbar sets it once.
      }
    }
  }, [savedViewParam]);

  // Ctrl/Cmd+S to save the current view. The raw listener this replaces had no
  // text-input guard, so it also fired while typing in the view name field it
  // opens.
  useKeyBinding("fo.grid.view.save", () => setIsOpen(true), {
    enablement: () => !disabled && !isEmptyView,
  });

  return (
    <Suspense fallback="Loading saved views...">
      <Box>
        <ViewDialog
          canEdit={!disabled}
          id="saved-views"
          savedViews={items}
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
        <SavedViewsSelection
          items={searchData}
          selected={selected}
          onSelect={(item: fos.DatasetViewOption) => {
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
            onSearch: (term: string) => {
              setViewSearch(term);
            },
          }}
          disabled={disabled}
          disabledMsg={disabledMsg}
          isEmptyView={isEmptyView}
        />
      </Box>
    </Suspense>
  );
}
