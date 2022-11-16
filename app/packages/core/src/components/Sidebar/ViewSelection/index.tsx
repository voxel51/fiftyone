import React, { useCallback, useEffect, useState } from "react";

import { Add } from "@mui/icons-material";
import styled from "styled-components";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import {
  atom,
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import * as fos from "@fiftyone/state";
import {
  PreloadedQuery,
  useLazyLoadQuery,
  usePreloadedQuery,
  useQueryLoader,
  useRefetchableFragment,
} from "react-relay";

import ViewDialog, { viewDialogContent } from "./ViewDialog";
import { useQueryState, useSavedViews } from "@fiftyone/state";
import {
  DatasetSavedViewsQuery,
  DatasetSavedViewsFragment,
} from "../../../Root/Root";
import { OperationType } from "relay-runtime";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
`;

const TextContainer = styled.div`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.text.primary};
`;

const AddIcon = styled(Add)`
  color: ${({ theme }) => theme.text.primary};
`;

export const viewSearchTerm = atom({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom({
  key: "viewDialogOpen",
  default: false,
});

const UNSAVED_SELECTED = {
  id: "0",
  label: "Unsaved view",
  color: "#818165",
  description: "Unsaved view",
};
const DEFAULT_SELECTED = {
  id: "1",
  label: "All samples",
  color: "#9e9e9e",
  description: "All samples",
};

// TODO: remove
export interface DatasetViewOption {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
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

  const items = data?.savedViews || [];
  console.log("items", items);

  const viewOptions: DatasetViewOption[] = [
    DEFAULT_SELECTED,
    ...items.map((item: DatasetView) => {
      const { name, urlName, color, description } = item;

      return {
        id: urlName,
        label: name,
        color: color,
        description: description || "",
      };
    }),
  ] as DatasetViewOption[];

  // TODO: get saved views here from state and pass as items instead
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

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
    if (!loadedView?.length) {
      setSelected(viewOptions[0]);
      setSavedViewParam(null);
    }
  }, [loadedView]);

  return (
    <Box>
      <ViewDialog
        onEditSuccess={() => {
          // TODO: MANI - redirect if name changes
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
        }}
        onDeleteSuccess={() => {
          // TODO: MANI - redirect if loaded view is deleted
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
        }}
      />
      <Selection
        selected={selected}
        setSelected={(item: DatasetViewOption) => {
          const allSelected = item.id === "1";
          setSelected(item);
          const selectedSavedView = allSelected ? "" : item.label;

          setView([], [], selectedSavedView);
          // if (selectedSavedView) {
          //   setSavedViewParam(selectedSavedView);
          // } else {
          //   setSavedViewParam(null);
          // }
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
          <Box onClick={() => setIsOpen(true)}>
            <Box style={{ width: "12%" }}>
              <AddIcon fontSize="small" />
            </Box>
            <TextContainer>Save current filters as view</TextContainer>
          </Box>
        }
      />
    </Box>
  );
}
