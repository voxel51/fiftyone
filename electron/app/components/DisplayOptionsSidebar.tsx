import React from "react";
import styled from "styled-components";

import CheckboxGrid, { Entry } from "./CheckboxGrid";
import DropdownCell from "./DropdownCell";

type AttributeMap = { [key: string]: number };

type Props = {
  tags: Entry[];
  labels: Entry[];
  scalars: Entry[];
};

const Container = styled.div`
  margin-bottom: 2px;
`;

const DisplayOptionsSidebar = ({ tags, labels, scalars }: Props) => {
  return (
    <Container>
      <DropdownCell label="Tags" expanded>
        <CheckboxGrid entries={tags} />
      </DropdownCell>
      <DropdownCell label="Labels" expanded>
        <CheckboxGrid entries={labels} />
      </DropdownCell>
      <DropdownCell label="Scalars" expanded>
        <CheckboxGrid entries={scalars} />
      </DropdownCell>
    </Container>
  );
};

export default DisplayOptionsSidebar;
