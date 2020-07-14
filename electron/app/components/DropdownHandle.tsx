import React from "react";
import styled from "styled-components";

import CellHeader from "./CellHeader";

const DropdownHandle = styled(CellHeader)`
  width: 15rem;
`;

export default ({ label, expanded }) => {
  return <DropdownHandle icon={expanded ? "^" : "v"}>{label}</DropdownHandle>;
};
