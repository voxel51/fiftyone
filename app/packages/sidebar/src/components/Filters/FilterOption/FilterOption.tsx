import { cssVar, Tooltip } from "@voxel51/voodo";
import Color from "color";
import React from "react";
import type { ReverbState } from "@fiftyone/reverb";
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
`;

const FilterMode = styled.div`
  border-radius: 4px;
  &:hover {
    background-color: ${cssVar.color.bg["card-elevated"]};
  }
  width: 100%;
  display: flex;
  flex-direction: row;
  cursor: pointer;
`;

interface Props {
  color: string;
  excludeAtom: ReverbState<boolean>;
  isMatchingAtom: ReverbState<boolean>;
  valueName: string;
  modal: boolean;
  path: string;
}

const FilterOption: React.FC<Props> = ({
  color,
  excludeAtom,
  isMatchingAtom,
  modal,
  path,
}) => {
  const [open, setOpen] = React.useState(false);
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
          onClick={() => !open && setOpen(true)}
        >
          <Selected
            color={color}
            filterKey={filterKey}
            options={options}
            visibilityKey={visibilityKey}
          />
          <Tooltip
            content={selected ?? ""}
            anchor={modal ? "left" : "right"}
            style={{ display: "flex", minWidth: 0 }}
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
        <Popout
          close={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
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
