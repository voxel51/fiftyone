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
  grid-template-columns: repeat(2, auto);
`;

const DisplayOptionsSidebar = ({ tags, labels, scalars }: Props) => {
  return (
    <Container>
      <DropdownCell label="Tags" expanded>
        <CheckboxGrid columnWidths={[3, 2]} entries={tags} />
      </DropdownCell>
      <DropdownCell label="Labels" expanded>
        <CheckboxGrid columnWidths={[3, 2]} entries={labels} />
      </DropdownCell>
      <DropdownCell label="Scalars" expanded>
        <CheckboxGrid columnWidths={[3, 2]} entries={scalars} />
      </DropdownCell>
    </Container>
  );
};

export default DisplayOptionsSidebar;
