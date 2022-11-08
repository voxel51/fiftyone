import React, { useState } from "react";

import { Add } from "@mui/icons-material";
import styled from "styled-components";

import { Selection } from "@fiftyone/components";
import { filter } from "lodash";
import { atom, useRecoilState, useSetRecoilState } from "recoil";

import ViewDialog from "./ViewDialog";
import { SelectionItemProps } from "@fiftyone/components/src/components/Selection/Option";

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

const mockData = [
  {
    description: "All samples",
    id: "1",
    label: "All samples",
    color: "#787878",
  },
  {
    description: "Approved samples",
    id: "2",
    label: "Approved",
    color: "#12B76A",
  },
  {
    description: "Needs cleaning",
    id: "3",
    label: "Needs cleaning",
    color: "#F79009",
  },
  {
    description: "September view very long text it is",
    id: "4",
    label:
      "September view very long text it is September view very long text it is",
    color: "#875BF7",
  },
  {
    description: "check these assets and mark as approved/declined",
    id: "5",
    label: "Quality check",
    color: "#44ffbb",
  },
  {
    description: "Expert annotations",
    id: "6",
    label: "Expert annotations",
    color: "#EE99a6",
  },
];

export const viewSearchTerm = atom({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom({
  key: "viewDialogOpen",
  default: true,
});

const DEFAULT_SELECTED = { id: "1", label: "All samples", color: "#9e9e9e" };

export default function ViewSelection(props: {}) {
  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);

  // TODO: get saved views here from state and pass as items instead
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);
  const [selected, setSelected] = useState<SelectionItemProps>(
    mockData?.[0] || DEFAULT_SELECTED
  );

  const searchedData = filter(mockData, ({ id, label, description }) => {
    return (
      id === "1" ||
      label?.toLowerCase().includes(viewSearch) ||
      description?.toLowerCase().includes(viewSearch)
    );
  });

  return (
    <Box style={{ width: "100%" }}>
      <ViewDialog />
      <Selection
        selected={selected}
        setSelected={setSelected}
        items={searchedData}
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
