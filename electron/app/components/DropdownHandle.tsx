import React from "react";
import styled from "styled-components";

import CellHeader from "./CellHeader";

const DropdownHandle = styled(CellHeader)`
  width: 15rem;
`;

type Props = {
  label: number;
  expanded: boolean;
};

export default ({ label, expanded }: Props) => {
  return (
    <DropdownHandle icon={expanded ? "^" : "v"} clickable>
      {label}
    </DropdownHandle>
  );
};
