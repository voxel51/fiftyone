import React, { useState } from "react";

import { Add } from "@mui/icons-material";
import styled from "styled-components";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import { atom, useRecoilState, useSetRecoilState } from "recoil";

import ViewDialog, { viewDialogContent } from "./ViewDialog";

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
  items: [DatasetView];
}

export default function ViewSelection(props: Props) {
  const { items = [] } = props;
  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);

  const viewOptions: DatasetViewOption[] = [
    DEFAULT_SELECTED,
    ...items.map((item: DatasetView) => {
      const { name, urlName, color, description, createdAt } = item;

      return {
        id: urlName,
        label: name,
        color: color,
        description: description || "no description...",
      };
    }),
  ] as DatasetViewOption[];

  const setEditView = useSetRecoilState(viewDialogContent);

  // TODO: get saved views here from state and pass as items instead
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);
  const [selected, setSelected] = useState<DatasetViewOption>(viewOptions[0]);

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

  return (
    <Box style={{ width: "100%" }}>
      <ViewDialog />
      <Selection
        selected={selected}
        setSelected={setSelected}
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
