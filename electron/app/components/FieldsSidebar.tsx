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
import CheckboxGrid from "./CheckboxGrid";
import DropdownCell from "./DropdownCell";
import SelectionTag from "./Tags/SelectionTag";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { refreshColorMap as refreshColorMapSelector } from "../recoil/selectors";

export type Entry = {
  name: string;
  selected: boolean;
  count: number;
  type: string;
  path: string;
};

type Props = {
  tags: Entry[];
  labels: Entry[];
  frameLabels: Entry[];
  scalars: Entry[];
  unsupported: Entry[];
  onSelectTag: (entry: Entry) => void;
};

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
  const refreshColorMap = useSetRecoilState(refreshColorMapSelector);
  const theme = useContext(ThemeContext);
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
        refreshColorMap(null);
        setClicked(true);
      }}
    >
      <Autorenew style={{ marginTop: 4 }} />
      <ButtonText>Refresh field colors</ButtonText>
    </Button>
  );
};

const Cell = ({
  label,
  icon,
  entries,
  onSelect,
  colorMap = {},
  title,
  modal,
  prefix = "",
}) => {
  const theme = useContext(ThemeContext);
  const [expanded, setExpanded] = useState(true);
  const numSelected = entries.filter((e) => e.selected).length;
  const handleClear = (e) => {
    if (!onSelect) {
      return;
    }
    e.stopPropagation();
    for (const entry of entries) {
      if (entry.selected) {
        onSelect({ ...entry, selected: false });
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
            color: colorMap[prefix + e.name]
              ? colorMap[prefix + e.name]
              : theme.backgroundLight,
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
  }
  if (typeof totalCount === "number") {
    return totalCount.toLocaleString();
  }
  return totalCount;
};

const FieldsSidebar = React.forwardRef(
  (
    {
      modal = false,
      tags = [],
      labels = [],
      frameLabels = [],
      scalars = [],
      unsupported = [],
      onSelectTag,
      onSelectLabel,
      onSelectFrameLabel,
      onSelectScalar,
      colorByLabelAtom,
      ...rest
    }: Props,
    ref
  ) => {
    const [colorByLabel, setColorByLabel] = useRecoilState(colorByLabelAtom);
    const theme = useContext(ThemeContext);
    const colorMap = useRecoilValue(atoms.colorMap);
    const cellRest = { modal };
    const mediaType = useRecoilValue(selectors.mediaType);
    const isVideo = mediaType === "video";

    return (
      <Container ref={ref} {...rest}>
        <Cell
          colorMap={colorMap}
          label="Tags"
          icon={<PhotoLibrary />}
          entries={tags}
          onSelect={onSelectTag}
          {...cellRest}
        />
        <Cell
          colorMap={colorMap}
          label="Labels"
          icon={<Label style={{ transform: "rotate(180deg)" }} />}
          entries={labels}
          onSelect={onSelectLabel}
          {...cellRest}
        />
        {isVideo && (
          <Cell
            colorMap={colorMap}
            label="Frame Labels"
            icon={<PhotoLibrary />}
            entries={frameLabels}
            onSelect={onSelectFrameLabel}
            {...cellRest}
            prefix="frames."
          />
        )}
        <Cell
          colorMap={colorMap}
          label="Scalars"
          icon={<BarChart />}
          entries={scalars}
          onSelect={onSelectScalar}
          {...cellRest}
        />
        {unsupported.length ? (
          <Cell
            label="Unsupported"
            title="These fields cannot currently be displayed in the app"
            icon={<Help />}
            colorMap={{}}
            entries={unsupported.map((entry) => ({
              ...entry,
              selected: false,
              disabled: true,
            }))}
            {...cellRest}
          />
        ) : null}
        <Cell
          label="Options"
          title="Field options"
          icon={<Settings />}
          onSelect={() => setColorByLabel(!colorByLabel)}
          colorMap={{
            "Color by label": theme.brand,
          }}
          entries={[
            {
              name: "Color by label",
              selected: colorByLabel,
              icon: <Brush style={{ paddingTop: "0.4rem" }} />,
            },
          ]}
        />
      </Container>
    );
  }
);

export default FieldsSidebar;
