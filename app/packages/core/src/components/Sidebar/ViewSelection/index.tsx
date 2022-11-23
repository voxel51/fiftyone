import React, { useEffect, useState } from "react";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import * as fos from "@fiftyone/state";
import { usePreloadedQuery, useRefetchableFragment } from "react-relay";

import ViewDialog, { viewDialogContent } from "./ViewDialog";
import { useQueryState } from "@fiftyone/state";
import {
  DatasetSavedViewsQuery,
  DatasetSavedViewsFragment,
} from "../../../Root/Root";
import { Box, LastOption, AddIcon, TextContainer } from "./styledComponents";

export const viewSearchTerm = atom({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom({
  key: "viewDialogOpen",
  default: false,
});
export const lastLoadedSavedViewState = atom<fos.State.SavedView | null>({
  key: "lastLoadedSavedViewState",
  default: null,
});

const DEFAULT_SELECTED = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
};

// TODO: remove
export interface DatasetViewOption {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  viewStages?: readonly string[];
}

export interface DatasetView {
  name: string;
  urlName: string;
  color: string | null;
  description: string | null;
  createdAt: number;
  datasetId: string;
  viewStages: any;
  lastLoadedAt: number | null;
  lastModifiedAt: number | null;
}

interface Props {
  datasetName: string;
  queryRef: any;
}

export default function ViewSelection(props: Props) {
  const { datasetName, queryRef } = props;

  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);
  const [savedViewParam, setSavedViewParam] = useQueryState("view");
  const loadedView = useRecoilValue(fos.view);
  const setEditView = useSetRecoilState(viewDialogContent);
  const setView = fos.useSetView();

  const fragments = usePreloadedQuery(DatasetSavedViewsQuery, queryRef);
  const [data, refetch] = useRefetchableFragment(
    DatasetSavedViewsFragment,
    fragments
  );

  const items =
    (data as { savedViews: [fos.State.SavedView] })?.savedViews || [];
  const isEmptyView = !loadedView?.length;

  const viewOptions: DatasetViewOption[] = [
    DEFAULT_SELECTED,
    ...items.map((item: fos.State.SavedView) => {
      const { name, urlName, color, description, viewStages } = item;

      return {
        id: urlName,
        label: name,
        color: color,
        description: description || "",
        viewStages,
      };
    }),
  ] as DatasetViewOption[];

  // TODO: get saved views here from state and pass as items instead
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

  const searchedData: DatasetViewOption[] = filter(
    viewOptions,
    ({ id, label, description }: DatasetViewOption) => {
      return (
        id === "1" ||
        label?.toLowerCase().includes(viewSearch) ||
        description?.toLowerCase().includes(viewSearch)
      );
    }
  ) as DatasetViewOption[];

  useEffect(() => {
    if (isEmptyView) {
      setSelected(viewOptions[0]);
      setSavedViewParam(null);
    }
  }, [loadedView]);

  useEffect(() => {
    if (viewOptions?.length && savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.id === savedViewParam
      )?.[0];

      if (!potentialView) {
        setSavedViewParam(null);
      } else if (selected?.id !== savedViewParam) {
        setSelected(potentialView);
      }
    }
  }, [viewOptions, savedViewParam]);

  let selectedView = viewOptions[0];
  if (savedViewParam) {
    const potentialView = viewOptions.filter(
      (v) => v.id === savedViewParam
    )?.[0];
    if (potentialView) {
      selectedView = potentialView;
    }
  }
  const [selected, setSelected] = useState<DatasetViewOption>(selectedView);

  // to detect unsaved views
  useEffect(() => {
    if (selected && loadedView) {
      if (
        selected.viewStages?.length !== loadedView?.length &&
        selected.id !== "1"
      ) {
        setSavedViewParam(null);
        setSelected(viewOptions[0]);
      }
    }
  }, [selected, loadedView]);

  return (
    <Box>
      <ViewDialog
        savedViews={items}
        onEditSuccess={(savedView?: fos.State.SavedView, reload?: boolean) => {
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
          if (savedView && reload) {
            setView([], [], savedView?.name, true, savedView?.urlName);
          }
        }}
        onDeleteSuccess={() => {
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
          setView([], [], "", true, "");
        }}
      />
      <Selection
        selected={selected}
        setSelected={(item: DatasetViewOption) => {
          const allSelected = item.id === "1";
          setSelected(item);
          const selectedSavedView = allSelected ? "" : item.label;
          const selectedSavedViewUrlName = allSelected ? "" : item.id;
          setView([], [], selectedSavedView, true, selectedSavedViewUrlName);
        }}
        items={searchedData}
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
  );
}
