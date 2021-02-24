import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { useRecoilValue, useRecoilState } from "recoil";
import {
  Autorenew,
  BarChart,
  Check,
  Close,
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
import * as labelAtoms from "./Filters/LabelFieldFilters.state";
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
  handleClear: (event: Event) => void;
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

const makeData = (filteredCount: number, totalCount: number): string => {
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
    fieldAtoms.activeTags(modal)
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
        disabled: false,
        hideCheckbox: modal,
        hasDropdown: false,
        selected: activeTags.includes(name),
        color: colorMap[name],
        title: name,
        path: name,
        data: modal ? (
          count[name] > 0 ? (
            <Check style={{ color: colorMap[name] }} />
          ) : (
            <Close style={{ color: colorMap[name] }} />
          )
        ) : (
          makeData(subCount[name], count[name])
        ),
        totalCount: count[name],
        filteredCount: modal ? null : subCount[name],
        modal,
      }))}
      onSelect={({ name, selected }) =>
        setActiveTags(
          selected
            ? [name, ...activeTags]
            : activeTags.filter((t) => t !== name)
        )
      }
      handleClear={(e) => {
        e.stopPropagation();
        setActiveTags([]);
      }}
      modal={modal}
      title={"Tags"}
    />
  );
};

type LabelsCellProps = {
  modal: boolean;
  frames: boolean;
};

const LabelsCell = ({ modal, frames }: LabelsCellProps) => {
  const key = frames ? "frame" : "sample";
  const labels = useRecoilValue(selectors.labelNames(key));
  const [activeLabels, setActiveLabels] = useRecoilState(
    fieldAtoms.activeLabels({ modal, frames })
  );
  const types = useRecoilValue(selectors.labelTypesMap);

  const colorMap = useRecoilValue(selectors.colorMap);
  const [subCountAtom, countAtom] = modal
    ? [
        labelAtoms.labelSampleModalCounts(key),
        labelAtoms.labelSampleModalCounts(key),
      ]
    : [
        labelAtoms.filteredLabelSampleCounts(key),
        labelAtoms.labelSampleCounts(key),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);

  return (
    <Cell
      label={frames ? "Frame Labels" : "Labels"}
      icon={<Label style={{ transform: "rotate(180deg)" }} />}
      entries={labels.map((name) => {
        const path = frames ? "frames." + name : name;
        return {
          name,
          disabled: false,
          hideCheckbox: modal,
          hasDropdown: true,
          selected: activeLabels.includes(path),
          color: colorMap[path],
          title: name,
          path,
          data:
            count && subCount ? makeData(subCount[name], count[name]) : null,
          totalCount: count ? count[name] : null,
          filteredCount: subCount ? subCount[name] : null,
          modal,
          labelType: types[path],
        };
      })}
      onSelect={({ name, selected }) =>
        setActiveLabels(
          selected
            ? [name, ...activeLabels]
            : activeLabels.filter((t) => t !== name)
        )
      }
      handleClear={(e) => {
        e.stopPropagation();
        setActiveLabels([]);
      }}
      modal={modal}
      title={frames ? "Frame Labels" : "Labels"}
    />
  );
};

type ScalarsCellProps = {
  modal: boolean;
};

const ScalarsCell = ({ modal }: ScalarsCellProps) => {
  const scalars = useRecoilValue(selectors.scalarNames("sample"));
  const [activeScalars, setActiveScalars] = useRecoilState(
    fieldAtoms.activeScalars(modal)
  );

  const colorMap = useRecoilValue(selectors.colorMap);
  const [subCountAtom, countAtom] = modal
    ? [
        labelAtoms.labelSampleModalCounts("sample"),
        labelAtoms.labelSampleModalCounts("sampl"),
      ]
    : [
        labelAtoms.filteredLabelSampleCounts("sample"),
        labelAtoms.labelSampleCounts("sample"),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);

  return (
    <Cell
      label="Scalars"
      icon={<BarChart />}
      entries={scalars.map((name) => ({
        name,
        disabled: false,
        hideCheckbox: modal,
        hasDropdown: true,
        selected: activeScalars.includes(name),
        color: colorMap[name],
        title: name,
        path: name,
        data: count && subCount ? makeData(subCount[name], count[name]) : null,
        totalCount: count ? count[name] : null,
        filteredCount: subCount ? subCount[name] : null,
        modal,
      }))}
      onSelect={({ name, selected }) =>
        setActiveScalars(
          selected
            ? [name, ...activeScalars]
            : activeScalars.filter((t) => t !== name)
        )
      }
      handleClear={(e) => {
        e.stopPropagation();
        setActiveScalars([]);
      }}
      modal={modal}
      title={"Scalars"}
    />
  );
};

type FieldsSidebarProps = {
  modal: boolean;
  style: object;
};

const FieldsSidebar = React.forwardRef(
  ({ modal, style }: FieldsSidebarProps, ref) => {
    const mediaType = useRecoilValue(selectors.mediaType);
    const isVideo = mediaType === "video";

    return (
      <Container ref={ref} style={style}>
        <TagsCell modal={modal} />
        <LabelsCell modal={modal} frames={false} />
        {isVideo && <LabelsCell modal={modal} frames={true} />}
        <ScalarsCell modal={modal} />
      </Container>
    );
  }
);

export default FieldsSidebar;
