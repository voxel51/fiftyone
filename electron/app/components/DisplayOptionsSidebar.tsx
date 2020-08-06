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
    color: ${({ theme }) => theme.fontDark};

    .label {
      text-transform: uppercase;
    }

    ${SelectionTag.Body} {
      float: right;
    }
  }

  .left-icon {
    margin-right: 4px;
  }
`;

const Cell = ({ label, icon, entries, onSelect, colorMapping }) => {
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
          <span class="label">{label}</span>
          {numSelected ? (
            <SelectionTag count={numSelected} onClear={handleClear} />
          ) : null}
        </>
      }
      expanded={expanded}
      onExpand={setExpanded}
    >
      {entries.length ? (
        <CheckboxGrid
          columnWidths={[3, 2]}
          entries={entries.map((e) => ({
            name: e.name,
            selected: e.selected,
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

const DisplayOptionsSidebar = ({
  colorMapping = {},
  tags = [],
  labels = [],
  scalars = [],
  unsupported = [],
  onSelectTag,
}: Props) => {
  return (
    <Container>
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
      />
      <Cell
        colorMapping={colorMapping}
        label="Scalars"
        icon={<BarChart />}
        entries={scalars}
      />
      {unsupported.length ? (
        <Cell
          label="Unsupported"
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
};

export default DisplayOptionsSidebar;
