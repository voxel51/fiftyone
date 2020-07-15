import React from "react";
import styled from "styled-components";

import CheckboxGrid from "./CheckboxGrid";
import DropdownCell from "./DropdownCell";

type AttributeMap = { [key: string]: number };

type Props = {
  tags: AttributeMap;
  labels: AttributeMap;
  scalars: AttributeMap;
};

const createEntries = (map: AttributeMap) => {
  return Object.entries(map).map(([name, value]) => ({
    name,
    data: [value],
    selected: false,
  }));
};

const Container = styled.div`
  margin-bottom: 2px;
`;

const DisplayOptionsSidebar = ({ tags, labels, scalars }: Props) => {
  return (
    <Container>
      <DropdownCell label="Tags" expanded>
        <CheckboxGrid entries={createEntries(tags)} />
      </DropdownCell>
      <DropdownCell label="Labels" expanded>
        <CheckboxGrid entries={createEntries(labels)} />
      </DropdownCell>
      <DropdownCell label="Scalars" expanded>
        <CheckboxGrid entries={createEntries(scalars)} />
      </DropdownCell>
    </Container>
  );
};

export default DisplayOptionsSidebar;
