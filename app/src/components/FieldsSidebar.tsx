import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { useRecoilValue, useRecoilState } from "recoil";
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
import { Entry } from "./CheckboxGroup";
import * as fieldAtoms from "./Filters/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useTheme } from "../utils/hooks";

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
  const theme = useTheme();
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
  onSelect: (entry: Entry) => void;
  handleClear: () => void;
  entries: Entry[];
  icon: any;
};

const Cell = ({
  label,
  icon,
  entries,
  handleClear,
  onSelect,
  title,
  modal,
}: CellProps) => {
  const [expanded, setExpanded] = useState(true);
  const numSelected = entries.filter((e) => e.selected).length;

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
        <CheckboxGrid entries={entries} onCheck={onSelect} modal={modal} />
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
  const tags = useRecoilValue(selectors.tagNames);
  const [activeTags, setActiveTags] = useRecoilState(
    modal ? fieldAtoms.modalActiveTags : fieldAtoms.activeTags
  );
  const colorMap = useRecoilValue(selectors.colorMap);
  const [subCountAtom, countAtom] = modal
    ? [null, selectors.tagSampleModalCounts]
    : [selectors.filteredTagSampleCounts, selectors.tagSampleCounts];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);

  return (
    <Cell
      label="Tags"
      icon={<PhotoLibrary />}
      entries={tags.map((name) => ({
        name,
        selected: activeTags.includes(name),
        color: colorMap[name],
        title: name,
        path: name,
        data: count,
        hideCheckbox: modal,
        modal: modal,
      }))}
      onSelect={({ name, selected }) =>
        setActiveTags(
          selected
            ? [name, ...activeTags]
            : activeTags.filter((t) => t !== name)
        )
      }
      handleClear={() => setActiveTags([])}
      modal={modal}
      title={"Tags"}
    />
  );
};

type FieldsSidebarProps = {
  modal: boolean;
};

const FieldsSidebar = React.forwardRef(({ modal }: FieldsSidebarProps, ref) => {
  const mediaType = useRecoilValue(selectors.mediaType);
  const isVideo = mediaType === "video";

  return (
    <Container ref={ref}>
      <TagsCell modal={modal} />
    </Container>
  );
});

export default FieldsSidebar;
