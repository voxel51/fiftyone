import React, { Suspense, useEffect, useMemo } from "react";
import { filter, map } from "lodash";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { usePreloadedQuery, useRefetchableFragment } from "react-relay";

import qs from "qs";
import * as fos from "@fiftyone/state";
import { Selection } from "@fiftyone/components";

import ViewDialog, { viewDialogContent } from "./ViewDialog";
import {
  DatasetSavedViewsQuery,
  DatasetSavedViewsFragment,
} from "../../../Root/Root";
import { Box, LastOption, AddIcon, TextContainer } from "./styledComponents";
import { isElectron } from "@fiftyone/utilities";
import { shouldToggleBookMarkIconOnSelector } from "../../Actions/ActionsRow";

const DEFAULT_SELECTED: DatasetViewOption = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
  slug: "unsaved-view",
  viewStages: [],
};

export const viewSearchTerm = atom<string>({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom<boolean>({
  key: "viewDialogOpen",
  default: false,
});
export const selectedSavedViewState = atom<DatasetViewOption | null>({
  key: "selectedSavedViewState",
  default: DEFAULT_SELECTED,
});

export type DatasetViewOption = Pick<
  fos.State.SavedView,
  "id" | "description" | "color" | "viewStages"
> & { label: string; slug: string };

export interface DatasetView {
  id: string;
  name: string;
  datasetId: string;
  slug: string;
  color: string | null;
  description: string | null;
  viewStages: readonly string[];
}

interface Props {
  datasetName: string;
  queryRef: any;
}

export default function ViewSelection(props: Props) {
  const [selected, setSelected] = useRecoilState<DatasetViewOption | null>(
    selectedSavedViewState
  );
  const canEditSavedViews = useRecoilValue<boolean>(fos.canEditSavedViews);
  const existingQueries = qs.parse(location.search, {
    ignoreQueryPrefix: true,
  });
  const isIPython = existingQueries?.["context"] === "ipython";

  const { datasetName, queryRef } = props;
  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);
  const [savedViewParam, setSavedViewParam] = fos.useQueryState("view");
  const setEditView = useSetRecoilState(viewDialogContent);
  const setView = fos.useSetView();
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

  const { savedViews: savedViewsV2 = [] } = fos.useSavedViews();

  const fragments = usePreloadedQuery(DatasetSavedViewsQuery, queryRef);
  const [data, refetch] = useRefetchableFragment(
    DatasetSavedViewsFragment,
    fragments
  );

  const items =
    (data as { savedViews: fos.State.SavedView[] })?.savedViews || [];

  const viewOptions: DatasetViewOption[] = useMemo(
    () => [
      DEFAULT_SELECTED,
      ...map(items, ({ name, color, description, slug, viewStages }) => ({
        id: slug,
        label: name,
        color,
        description,
        slug: slug,
        viewStages,
      })),
    ],
    [items]
  );

  const searchData: DatasetViewOption[] = useMemo(
    () =>
      filter(
        viewOptions,
        ({ id, label, description, slug }: DatasetViewOption) =>
          id === DEFAULT_SELECTED.id ||
          label.toLowerCase().includes(viewSearch) ||
          description?.toLowerCase().includes(viewSearch) ||
          slug?.toLowerCase().includes(viewSearch)
      ) as DatasetViewOption[],
    [viewOptions, viewSearch]
  );

  useEffect(() => {
    if (
      selected &&
      selected?.id !== DEFAULT_SELECTED.id &&
      searchData?.length
    ) {
      const potentialView = searchData.filter(
        (v) => v.slug === selected.slug
      )?.[0];
      if (potentialView) {
        setSelected(potentialView);
      }
    }
  }, [searchData, selected]);

  const loadedView = useRecoilValue<fos.State.Stage[]>(fos.view);
  const bookmarkIconOn = useRecoilValue(shouldToggleBookMarkIconOnSelector);
  const isEmptyView = !bookmarkIconOn && !loadedView?.length;
  // special case for electron app to clear the selection
  // when there is no loaded view
  const isDesktop = isElectron();
  useEffect(() => {
    if ((isDesktop || isIPython) && !loadedView.length) {
      setSelected(DEFAULT_SELECTED);
    }
  }, [isDesktop, loadedView, isIPython]);

  useEffect(() => {
    if (savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.slug === savedViewParam
      )?.[0];
      if (potentialView) {
        // no unnecessary setView call if selected has not changed
        if (selected && selected.id === potentialView.id) {
          return;
        }
        setSelected(potentialView);
        setView(
          potentialView.viewStages,
          [],
          potentialView.label,
          true,
          potentialView.slug
        );
      } else {
        const potentialUpdatedView = savedViewsV2.filter(
          (v) => v.slug === savedViewParam
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
                setView(
                  [],
                  [],
                  potentialUpdatedView.name,
                  true,
                  potentialUpdatedView.slug
                );
              },
            }
          );
        } else {
          // bad/old view param
          setSelected(DEFAULT_SELECTED);
          setView(loadedView, [], "", false, "");
        }
      }
    } else {
      // no view param
      if (!isIPython && selected && selected.slug !== DEFAULT_SELECTED.slug) {
        setSelected(DEFAULT_SELECTED);
        // do not reset view to [] again. The viewbar sets it once.
      }
    }
  }, [savedViewParam]);

  useEffect(() => {
    const callback = (event: KeyboardEvent) => {
      if (!canEditSavedViews) {
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
  }, [isEmptyView, canEditSavedViews]);

  return (
    <Suspense fallback="Loading saved views...">
      <Box>
        <ViewDialog
          canEdit={canEditSavedViews}
          savedViews={items}
          onEditSuccess={(
            createSavedView: fos.State.SavedView,
            reload?: boolean
          ) => {
            refetch(
              { name: datasetName },
              {
                fetchPolicy: "network-only",
                onComplete: (newOptions) => {
                  if (createSavedView && reload) {
                    setSavedViewParam(createSavedView.slug);
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
                    setSavedViewParam(null);
                    setView([], [], "", false, "");

                    if (isDesktop) {
                      setSelected(DEFAULT_SELECTED);
                    }
                  }
                },
              }
            );
          }}
        />
        <Selection
          readonly={!canEditSavedViews}
          selected={selected}
          setSelected={(item: DatasetViewOption) => {
            setSelected(item);
            setView(item.viewStages, [], item.label, true, item.slug);
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
              onClick={() =>
                canEditSavedViews && !isEmptyView && setIsOpen(true)
              }
              disabled={isEmptyView || !canEditSavedViews}
            >
              <Box style={{ width: "12%" }}>
                <AddIcon fontSize="small" disabled={isEmptyView} />
              </Box>
              <TextContainer disabled={isEmptyView}>
                Save current filters as view
              </TextContainer>
            </LastOption>
          }
        />
      </Box>
    </Suspense>
  );
}
