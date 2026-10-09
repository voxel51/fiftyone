import { Text, TextColor, TextVariant, Tooltip } from "@voxel51/voodo";
import Color from "color";
import React from "react";
import type { ReverbState } from "@fiftyone/reverb";
import styled from "styled-components";
import Item from "./FilterItem";
import Popout from "./Popout";
import Selected from "./Selected";
import useOnSelect from "./useOnSelect";
import useOptions from "./useOptions";

const FilterOptionContainer = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;

const FilterMode = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
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

  if (options.length < 2) {
    return null;
  }

  return (
    <FilterOptionContainer>
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
            variant={TextVariant.BodyTertiary}
            color={TextColor.Secondary}
            onClick={() => setOpen(!open)}
            style={{
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {selected}
          </Text>
        </Tooltip>
      </FilterMode>
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
