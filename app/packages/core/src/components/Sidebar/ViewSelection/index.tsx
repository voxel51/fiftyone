import React, { Suspense, useContext, useEffect, useMemo } from "react";
import { filter, map } from "lodash";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { useRefetchableFragment } from "react-relay";

import qs from "qs";
import * as fos from "@fiftyone/state";
import { Selection } from "@fiftyone/components";

import ViewDialog, { viewDialogContent } from "./ViewDialog";
import { DatasetQueryRef, DatasetSavedViewsFragment } from "../../../Dataset";
import { Box, LastOption, AddIcon, TextContainer } from "./styledComponents";
import { shouldToggleBookMarkIconOnSelector } from "../../Actions/ActionsRow";
import { viewName } from "@fiftyone/state";

const DEFAULT_SELECTED: DatasetViewOption = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
  name: "unsaved-view",
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
  "id" | "description" | "color" | "viewStages" | "name"
> & { label: string };

export interface DatasetView {
  id: string;
  name: string;
  datasetId: string;
  color: string | null;
  description: string | null;
  viewStages: readonly string[];
}

export default function ViewSelection() {
  const [selected, setSelected] = useRecoilState<DatasetViewOption | null>(
    selectedSavedViewState
  );

  const existingQueries = qs.parse(location.search, {
    ignoreQueryPrefix: true,
  });
  const datasetName = useRecoilValue(fos.datasetName);
  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);
  const savedViewParam = useRecoilValue(viewName);
  const setEditView = useSetRecoilState(viewDialogContent);
  const setView = fos.useSetView();
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

  const { savedViews: savedViewsV2 = [] } = fos.useSavedViews();

  const fragmentRef = useContext(DatasetQueryRef);

  if (!fragmentRef) throw new Error("ref not defined");

  const [data, refetch] = useRefetchableFragment(
    DatasetSavedViewsFragment,
    fragmentRef
  );

  const items =
    (data as { savedViews: fos.State.SavedView[] })?.savedViews || [];

  const viewOptions: DatasetViewOption[] = useMemo(
    () => [
      DEFAULT_SELECTED,
      ...map(items, ({ name, color, description, viewStages }) => ({
        id: name,
        name,
        label: name,
        color,
        description,
        viewStages,
      })),
    ],
    [items]
  );

  const searchData: DatasetViewOption[] = useMemo(
    () =>
      filter(
        viewOptions,
        ({ id, label, description, name }: DatasetViewOption) =>
          id === DEFAULT_SELECTED.id ||
          label.toLowerCase().includes(viewSearch) ||
          description?.toLowerCase().includes(viewSearch) ||
          name?.toLowerCase().includes(viewSearch)
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
        (v) => v.name === selected.name
      )?.[0];
      if (potentialView) {
        setSelected(potentialView);
      }
    }
  }, [searchData, selected]);

  const loadedView = useRecoilValue<fos.State.Stage[]>(fos.view);
  const bookmarkIconOn = useRecoilValue(shouldToggleBookMarkIconOnSelector);
  const isEmptyView = !bookmarkIconOn && !loadedView?.length;

  useEffect(() => {
    if (savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.name === savedViewParam
      )?.[0];
      if (potentialView) {
        // no unnecessary setView call if selected has not changed
        if (selected && selected.id === potentialView.id) {
          return;
        }
        setSelected(potentialView);
      } else {
        const potentialUpdatedView = savedViewsV2.filter(
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
                });
              },
            }
          );
        } else {
          // bad/old view param
          setSelected(DEFAULT_SELECTED);
        }
      }
    } else {
      // no view param
      if (selected && selected.name !== DEFAULT_SELECTED.name) {
        setSelected(DEFAULT_SELECTED);
        // do not reset view to [] again. The viewbar sets it once.
      }
    }
  }, [savedViewParam]);

  useEffect(() => {
    const callback = (event: KeyboardEvent) => {
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
  }, [isEmptyView]);

  return (
    <Suspense fallback="Loading saved views...">
      <Box>
        <ViewDialog
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
                    setView([], undefined, createSavedView.name);
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
                    setView([], []);
                  }
                },
              }
            );
          }}
        />
        <Selection
          selected={selected}
          setSelected={(item: DatasetViewOption) => {
            setSelected(item);
            setView(item.viewStages, [], item.name);
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
              onClick={() => !isEmptyView && setIsOpen(true)}
              disabled={isEmptyView}
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
