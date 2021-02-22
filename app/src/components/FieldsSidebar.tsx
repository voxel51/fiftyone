import React, { useState, useContext } from "react";
import { animated, useSpring } from "react-spring";
import styled, { ThemeContext } from "styled-components";
import { useRecoilValue, useSetRecoilState, useRecoilState } from "recoil";
import {
  Autorenew,
  BarChart,
  Help,
  Label,
  PhotoLibrary,
  Settings,
  Brush,
} from "@material-ui/icons";

import CellHeader from "./CellHeader";
import CheckboxGrid from "./CheckboxGroup";
import DropdownCell from "./DropdownCell";
import SelectionTag from "./Tags/SelectionTag";
import * as fieldAtoms from "./Filters/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const Button = animated(styled.div`
  cursor: pointer;
  width: 100%;
  margin-top: 3px;
  margin-left: 0;
  margin-right: 0;
  padding: 0 0.2em;
  border-radius: 2px;
  display: flex;
  height: 32px;
`);

const ButtonText = styled.div`
  padding-right: 4px;
  padding-left: 2px;
  white-space: nowrap;
  overflow-x: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
  padding-top: 4px;
  letter-spacing: 0.00938em;
  line-height: 24px;
`;

const Container = styled.div`
  .MuiCheckbox-root {
    padding: 4px 8px 4px 4px;
  }

  ${CellHeader.Body} {
    display: flex;
    align-items: center;
    color: ${({ theme }) => theme.fontDark};

    * {
      display: flex;
    }

    .label {
      text-transform: uppercase;
    }

    ${SelectionTag.Body} {
      float: right;
    }

    .push {
      margin-left: auto;
    }
    .icon {
      margin-left: 2px;
    }
  }

  .left-icon {
    margin-right: 4px;
  }
`;

const RefreshButton = () => {
  const theme = useContext(ThemeContext);
  const [colorSeed, setColorSeed] = useRecoilState(atoms.colorSeed);
  const [clicked, setClicked] = useState(false);
  const props = useSpring({
    backgroundColor: clicked ? theme.backgroundLight : theme.background,
    color: clicked ? theme.font : theme.fontDark,
    onRest: () => clicked && setClicked(false),
    config: {
      duration: 250,
    },
  });
  return (
    <Button
      style={props}
      onClick={() => {
        setColorSeed(colorSeed + 1);
        setClicked(true);
      }}
    >
      <div style={{ marginTop: 4 }}>
        <Autorenew />
      </div>
      <ButtonText>Refresh field colors</ButtonText>
    </Button>
  );
};

type CellProps = {
  label: string;
  title: string;
  modal: boolean;
  onSelect: (values: string[]) => void;
  path: string;
  entries: Entry[];
  icon: SVGElement;
};

const Cell = ({
  label,
  icon,
  entries,
  onSelect,
  title,
  modal,
  path = "",
}: CellProps) => {
  const theme = useContext(ThemeContext);
  const [expanded, setExpanded] = useState(true);
  const colorByLabel = useRecoilValue(
    modal ? atoms.modalColorByLabel : atoms.colorByLabel
  );
  const numSelected = entries.filter((e) => e.selected).length;
  const handleClear = (e) => {
    if (!onSelect) {
      return;
    }
    e.stopPropagation();
    for (const entry of entries) {
      if (entry.selected) {
        onSelect([]);
      }
    }
  };

  return (
    <DropdownCell
      label={
        <>
          {icon ? <span className="left-icon">{icon}</span> : null}
          <span className="label">{label}</span>
          <span className="push" />
          {numSelected ? (
            <SelectionTag
              count={numSelected}
              title="Clear selection"
              onClear={handleClear}
              onClick={handleClear}
            />
          ) : null}
        </>
      }
      title={title}
      expanded={expanded}
      onExpand={setExpanded}
    >
      {label === "Options" && <RefreshButton />}
      {entries.length ? (
        <CheckboxGrid
          columnWidths={[3, 2]}
          entries={entries.map((e) => ({
            name: e.name,
            selected: e.selected,
            type: e.type,
            data: e.icon ? e.icon : makeData(e.filteredCount, e.totalCount),
            totalCount: e.totalCount,
            filteredCount: e.filteredCount,
            color: colorByLabel
              ? theme.brand
              : colorMap[path]
              ? colorMap[path]
              : theme.brand,
            hideCheckbox: e.hideCheckbox,
            disabled: Boolean(e.disabled),
            path: prefix + e.name,
          }))}
          onCheck={onSelect}
          modal={modal}
          prefix={prefix}
        />
      ) : (
        <span>No options available</span>
      )}
    </DropdownCell>
  );
};

const makeData = (filteredCount, totalCount) => {
  if (
    typeof filteredCount === "number" &&
    filteredCount !== totalCount &&
    typeof totalCount === "number"
  ) {
    return `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`;
  } else if (filteredCount === null) {
    return null;
  } else if (typeof totalCount === "number") {
    return totalCount.toLocaleString();
  }
  return totalCount;
};

type TagsCellProps = {
  modal: boolean;
};

const TagsCell = ({ modal }: TagsCellProps) => {
  const [tags, setTags] = useRecoilState(
    modal ? fieldAtoms.modalActiveTags : fieldAtoms.activeTags
  );
  return (
    <Cell
      label="Tags"
      icon={<PhotoLibrary />}
      entries={tags}
      onSelect={onSelectTag}
      modal={modal}
    />
  );
};

type FieldsSidebarProps = {
  modal: boolean;
};

const FieldsSidebar = React.forwardRef(
  ({ modal = false }: FieldsSidebarProps, ref) => {
    const theme = useContext(ThemeContext);
    const colorMap = useRecoilValue(selectors.colorMap);
    const mediaType = useRecoilValue(selectors.mediaType);
    const isVideo = mediaType === "video";

    return (
      <Container ref={ref} {...rest}>
        <TagsCell modal={modal} />
      </Container>
    );
  }
);

export default FieldsSidebar;
