import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { IconButton } from "@mui/material";
import Color from "color";
import React from "react";
import { RecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import Item from "./FilterItem";
import Popout from "./Popout";
import Selected from "./Selected";
import useOnSelect from "./useOnSelect";
import useOptions from "./useOptions";

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
`;

const FilterOptionContainer = styled.div`
  position: relative;
  margin: 0 -0.5rem 0 -0.5rem;
`;

const FilterMode = styled.div`
  background-color: ${({ theme }) => theme.background.level3};
  &:hover {
    background-color: ${({ theme }) =>
      Color(theme.background.level3).alpha(0.5).string()};
  }
  width: 100%;
  display: flex;
  flex-direction: row;
  cursor: pointer;
`;

interface Props {
  excludeAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  valueName: string;
  modal: boolean;
  path: string;
}

const FilterOption: React.FC<Props> = ({
  path,
  modal,
  excludeAtom,
  isMatchingAtom,
}) => {
  const [open, setOpen] = React.useState(false);

  const color = useRecoilValue(fos.pathColor(path));
  const highlightedBGColor = Color(color).alpha(0.25).string();

  const options = useOptions(modal, path);
  const { filterKey, onSelect, selected, visibilityKey } = useOnSelect({
    close: () => setOpen(false),
    excludeAtom,
    isMatchingAtom,
    modal,
    options,
    path,
  });

  return (
    <FilterOptionContainer>
      {options.length > 1 && (
        <FilterMode
          data-cy="filter-mode-div"
          onClick={() => !open && setOpen(!open)}
        >
          <IconButton sx={{ color, size: "small" }}>
            <Selected
              filterKey={filterKey}
              options={options}
              visibilityKey={visibilityKey}
            />
          </IconButton>
          <Tooltip
            text={selected ?? ""}
            placement={modal ? "left-start" : "right-start"}
          >
            <Text
              onClick={() => setOpen(!open)}
              style={{
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                letterSpacing: "0.1px",
                cursor: "pointer",
              }}
            >
              {selected}
            </Text>
          </Tooltip>
        </FilterMode>
      )}
      {open && (
        <Popout close={() => setOpen(false)}>
          {options.map(({ key, ...option }) => (
            <Item
              key={key}
              color={color}
              highlightedBGColor={highlightedBGColor}
              onClick={() => onSelect(key)}
              {...option}
            />
          ))}
        </Popout>
      )}
    </FilterOptionContainer>
  );
};

export default FilterOption;
