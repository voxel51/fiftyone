import React, { useState } from "react";
import styled from "styled-components";

import CheckboxGrid from "./CheckboxGrid";
import DropdownCell from "./DropdownCell";

export type Entry = {
  name: string;
  selected: boolean;
  count: number;
};

type Props = {
  tags: Entry[];
  labels: Entry[];
  scalars: Entry[];
};

const Container = styled.div`
  margin-bottom: 2px;
`;

const Cell = ({ label, entries }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <DropdownCell label={label} expanded={expanded} onExpand={setExpanded}>
      {entries.length ? (
        <CheckboxGrid
          columnWidths={[3, 2]}
          entries={entries.map((e) => ({
            name: e.name,
            selected: e.selected,
            data: [(e.count || 0).toLocaleString()],
          }))}
        />
      ) : (
        <span>No options available</span>
      )}
    </DropdownCell>
  );
};

const DisplayOptionsSidebar = ({ tags, labels, scalars }: Props) => {
  return (
    <Container>
      <Cell label="Tags" entries={tags} />
      <Cell label="Labels" entries={labels} />
      <Cell label="Scalars" entries={scalars} />
    </Container>
  );
};

export default DisplayOptionsSidebar;
