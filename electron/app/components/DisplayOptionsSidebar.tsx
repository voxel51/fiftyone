import React, { useState } from "react";
import styled from "styled-components";

import { BarChart, Help, Label, PhotoLibrary } from "@material-ui/icons";

import CellHeader from "./CellHeader";
import CheckboxGrid from "./CheckboxGrid";
import DropdownCell from "./DropdownCell";
import SelectionTag from "./Tags/SelectionTag";

export type Entry = {
  name: string;
  selected: boolean;
  count: number;
  type: string;
};

type Props = {
  tags: Entry[];
  labels: Entry[];
  scalars: Entry[];
  unsupported: Entry[];
  onSelectTag: (entry: Entry) => void;
};

const Container = styled.div`
  margin-bottom: 2px;

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

const Cell = ({ label, icon, entries, onSelect, colorMapping, title }) => {
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
      {entries.length ? (
        <CheckboxGrid
          columnWidths={[3, 2]}
          entries={entries.map((e) => ({
            name: e.name,
            selected: e.selected,
            type: e.type,
            data: [(e.count || 0).toLocaleString()],
            color: colorMapping[e.name],
            disabled: Boolean(e.disabled),
          }))}
          onCheck={onSelect}
        />
      ) : (
        <span>No options available</span>
      )}
    </DropdownCell>
  );
};

const DisplayOptionsSidebar = React.forwardRef(
  (
    {
      colorMapping = {},
      tags = [],
      labels = [],
      scalars = [],
      unsupported = [],
      onSelectTag,
      onSelectLabel,
      onSelectScalar,
      ...rest
    }: Props,
    ref
  ) => {
    return (
      <Container ref={ref} {...rest}>
        <Cell
          colorMapping={colorMapping}
          label="Tags"
          icon={<PhotoLibrary />}
          entries={tags}
          onSelect={onSelectTag}
        />
        <Cell
          colorMapping={colorMapping}
          label="Labels"
          icon={<Label style={{ transform: "rotate(180deg)" }} />}
          entries={labels}
          onSelect={onSelectLabel}
        />
        <Cell
          colorMapping={colorMapping}
          label="Scalars"
          icon={<BarChart />}
          entries={scalars}
          onSelect={onSelectScalar}
        />
        {unsupported.length ? (
          <Cell
            label="Unsupported"
            title="These fields cannot currently be displayed in the app"
            icon={<Help />}
            colorMapping={{}}
            entries={unsupported.map((entry) => ({
              ...entry,
              selected: false,
              disabled: true,
            }))}
          />
        ) : null}
      </Container>
    );
  }
);

export default DisplayOptionsSidebar;
