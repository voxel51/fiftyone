import { Selection } from "@fiftyone/components";
import { useRefetchableSavedViews } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import React, { Suspense, useEffect, useMemo } from "react";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { shouldToggleBookMarkIconOnSelector } from "../../Actions/ActionsRow";
import ViewDialog, { viewDialogContent } from "./ViewDialog";
import { AddIcon, Box, LastOption, TextContainer } from "./styledComponents";

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
    fos.selectedSavedViewState
  );
  const datasetName = useRecoilValue(fos.datasetName);
  const canEditSavedViews = useRecoilValue(fos.canEditSavedViews);
  const setIsOpen = useSetRecoilState(viewDialogOpen);
  const [savedViewParam, setViewName] = useRecoilState(fos.viewName);
  const setEditView = useSetRecoilState(viewDialogContent);
  const resetView = useResetRecoilState(fos.view);
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);
  const isReadOnly = useRecoilValue(fos.readOnly);
  const canEdit = useMemo(
    () => canEditSavedViews && !isReadOnly,
    [canEditSavedViews, isReadOnly]
  );

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
    [items]
  );

  const searchData = useMemo(
    () =>
      viewOptions.filter(
        ({ id, label, description, slug }) =>
          id === fos.DEFAULT_SELECTED.id ||
          label?.toLowerCase().includes(viewSearch) ||
          description?.toLowerCase().includes(viewSearch) ||
          slug?.toLowerCase().includes(viewSearch)
      ),
    [viewOptions, viewSearch]
  );

  useEffect(() => {
    if (
      selected &&
      selected?.id !== fos.DEFAULT_SELECTED.id &&
      searchData?.length
    ) {
      const potentialView = searchData.filter(
        (v) => v.slug === selected.slug
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

  useEffect(() => {
    if (savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.label === savedViewParam
      )?.[0];
      if (potentialView) {
        if (selected && selected.id === potentialView.id) {
          return;
        }
        setSelected(potentialView as fos.DatasetViewOption);
      } else {
        const potentialUpdatedView = items.filter(
          (v) => v.name === savedViewParam
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
            }
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

  useEffect(() => {
    const callback = (event: KeyboardEvent) => {
      if (!canEdit) {
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
  }, [isEmptyView, canEdit]);

  return (
    <Suspense fallback="Loading saved views...">
      <Box>
        <ViewDialog
          canEdit={canEdit}
          id="saved-views"
          savedViews={items}
          onEditSuccess={(
            createSavedView: fos.State.SavedView,
            reload?: boolean
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
                  }
                },
              }
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
              }
            );
          }}
        />
        <Selection
          readonly={!canEdit}
          id="saved-views"
          selected={selected}
          setSelected={(item: fos.DatasetViewOption) => {
            setSelected(item);
            setViewName(item.slug);
          }}
          onClear={() => {
            setSelected(fos.DEFAULT_SELECTED);
            resetView();
          }}
          items={searchData}
          onEdit={(item) => {
            setEditView({
              color: item.color || "",
              description: item.description || "",
              isCreating: false,
              name: item.label,
            });
            setIsOpen(true);
          }}
          search={{
            value: viewSearch,
            placeholder: "Search views...",
            onSearch: (term: string) => {
              setViewSearch(term);
            },
          }}
          lastFixedOption={
            <LastOption
              data-cy={`saved-views-create-new`}
              onClick={() => canEdit && !isEmptyView && setIsOpen(true)}
              disabled={isEmptyView || !canEdit}
              title={
                canEdit
                  ? undefined
                  : "Can not save filters as a view in read-only mode"
              }
            >
              <Box style={{ width: "12%" }}>
                <AddIcon fontSize="small" disabled={isEmptyView || !canEdit} />
              </Box>
              <TextContainer disabled={isEmptyView || !canEdit}>
                Save current filters as view
              </TextContainer>
            </LastOption>
          }
        />
      </Box>
    </Suspense>
  );
}
