import React, { useState } from "react";
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
import { animated, useSpring } from "react-spring";

import CellHeader from "./CellHeader";
import CheckboxGrid from "./CheckboxGroup";
import DropdownCell from "./DropdownCell";
import SelectionTag from "./Tags/SelectionTag";
import { Entry } from "./CheckboxGroup";
import * as atoms from "../recoil/atoms";
import * as fieldAtoms from "./Filters/utils";
import * as labelAtoms from "./Filters/LabelFieldFilters.state";
import * as selectors from "../recoil/selectors";
import { stringify, FILTERABLE_TYPES } from "../utils/labels";
import { useTheme } from "../utils/hooks";

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

type CellProps = {
  label: string;
  title: string;
  modal: boolean;
  onSelect: (entry: Entry) => void;
  handleClear: (event: Event) => void;
  entries: Entry[];
  icon: any;
  children?: any;
};

const Cell = ({
  label,
  icon,
  entries,
  handleClear,
  onSelect,
  title,
  modal,
  children,
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
      {entries.length ? (
        <CheckboxGrid entries={entries} onCheck={onSelect} modal={modal} />
      ) : (
        <span>No options available</span>
      )}
      {children}
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
  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [null, selectors.tagSampleModalCounts]
    : [selectors.filteredTagSampleCounts, selectors.tagSampleCounts];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

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
        color: colorByLabel ? theme.brand : colorMap[name],
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

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [
        labelAtoms.filteredLabelSampleModalCounts(key),
        labelAtoms.labelSampleModalCounts(key),
      ]
    : [
        labelAtoms.filteredLabelSampleCounts(key),
        labelAtoms.labelSampleCounts(key),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label={frames ? "Frame Labels" : "Labels"}
      icon={
        frames ? (
          <PhotoLibrary />
        ) : (
          <Label style={{ transform: "rotate(180deg)" }} />
        )
      }
      entries={labels.map((name) => {
        const path = frames ? "frames." + name : name;
        return {
          name,
          disabled: false,
          hideCheckbox: false,
          hasDropdown: FILTERABLE_TYPES.includes(types[path]),
          selected: activeLabels.includes(path),
          color: colorByLabel ? theme.brand : colorMap[path],
          title: name,
          path,
          data:
            count && subCount ? makeData(subCount[name], count[name]) : null,
          totalCount: count ? count[name] : null,
          filteredCount: subCount ? subCount[name] : null,
          modal,
          labelType: types[path],
          canFilter: true,
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

  const colorMap = useRecoilValue(selectors.colorMap(modal));
  const [subCountAtom, countAtom] = modal
    ? [null, selectors.modalSample]
    : [
        labelAtoms.filteredLabelSampleCounts("sample"),
        labelAtoms.labelSampleCounts("sample"),
      ];

  const subCount = subCountAtom ? useRecoilValue(subCountAtom) : null;
  const count = useRecoilValue(countAtom);
  const colorByLabel = useRecoilValue(atoms.colorByLabel(modal));
  const theme = useTheme();

  return (
    <Cell
      label="Scalars"
      icon={<BarChart />}
      entries={scalars.map((name) => ({
        name,
        disabled: false,
        hideCheckbox: modal,
        hasDropdown: !modal,
        selected: activeScalars.includes(name),
        color: colorByLabel ? theme.brand : colorMap[name],
        title: name,
        path: name,
        data:
          count && subCount && !modal
            ? makeData(subCount[name], count[name])
            : modal
            ? stringify(count[name])
            : null,
        totalCount: !modal && count ? count[name] : null,
        filteredCount: !modal && subCount ? subCount[name] : null,
        modal,
        canFilter: !modal,
      }))}
      onSelect={({ name, selected }) => {
        setActiveScalars(
          selected
            ? [name, ...activeScalars]
            : activeScalars.filter((t) => t !== name)
        );
      }}
      handleClear={(e) => {
        e.stopPropagation();
        setActiveScalars([]);
      }}
      modal={modal}
      title={"Scalars"}
    />
  );
};

type UnsupportedCellProps = {
  modal: boolean;
};

const UnsupportedCell = ({ modal }: UnsupportedCellProps) => {
  const unsupported = useRecoilValue(fieldAtoms.unsupportedFields);
  return unsupported.length ? (
    <Cell
      label={"Unsupported"}
      icon={<Help />}
      entries={unsupported.map((e) => ({
        name: e,
        title: e,
        data: null,
        disabled: true,
        hideCheckbox: true,
        selected: false,
      }))}
      title={"Currently unsupported"}
      modal={modal}
    />
  ) : null;
};

const ButtonDiv = animated(styled.div`
  cursor: pointer;
  margin-left: 0;
  margin-right: 0;
  padding: 2.5px 0.5rem;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
`);

const OptionTextDiv = animated(styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: inherit;
  line-height: 1.7;
`);

export const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
};

export const Button = ({ onClick, text, children, style }) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const props = useSpring({
    backgroundColor: hover ? theme.brand : theme.background,
    color: hover ? theme.font : theme.fontDark,
    config: {
      duration: 150,
    },
  });
  return (
    <ButtonDiv
      style={{ ...props, userSelect: "none", ...style }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <OptionText style={{ fontWeight: "bold" }}>{text}</OptionText>
      {children}
    </ButtonDiv>
  );
};

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    atoms.colorSeed(Boolean(modal))
  );
  const theme = useTheme();
  return (
    <Button
      onClick={() => setColorSeed(colorSeed + 1)}
      text={"Refresh colors"}
      style={{ fontFamily: `"Roboto", "Helvetica", "Arial", sans-serif"` }}
    >
      <Autorenew style={{ height: "1.5rem", color: "inherit" }} />
    </Button>
  );
};

type OptionsCellProps = {
  modal: boolean;
};

const OptionsCell = ({ modal }: OptionsCellProps) => {
  const [colorByLabel, setColorByLabel] = useRecoilState(
    atoms.colorByLabel(modal)
  );
  const theme = useTheme();

  return (
    <Cell
      label={"Options"}
      icon={<Settings />}
      entries={[
        {
          name: "Color by value",
          title: "Color by value",
          selected: colorByLabel,
          color: theme.brand,
          hasDropdown: false,
          hideCheckbox: false,
          disabled: false,
          totalCount: null,
          path: null,
          data: null,
          filteredCount: null,
          icon: <Brush />,
        },
      ]}
      title={"Field options"}
      modal={modal}
      onSelect={() => setColorByLabel(!colorByLabel)}
      handleClear={() => setColorByLabel(false)}
    >
      <RefreshButton modal={modal} />
    </Cell>
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
        <UnsupportedCell modal={modal} />
        <OptionsCell modal={modal} />
      </Container>
    );
  }
);

export default FieldsSidebar;
