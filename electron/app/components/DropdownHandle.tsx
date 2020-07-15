import React from "react";
import styled from "styled-components";

import CellHeader from "./CellHeader";

const DropdownHandle = styled(CellHeader)`
  width: 15rem;
`;

type Props = {
  label: string;
  expanded: boolean;
  icon: (expanded: boolean) => ReactNode;
};

export const ArrowButton = (expanded) => (expanded ? "^" : "v");
export const PlusMinusButton = (expanded) => (expanded ? "-" : "+");

export default ({ label, expanded, icon = ArrowButton }: Props) => {
  return (
    <DropdownHandle icon={icon(expanded)} clickable>
      {label}
    </DropdownHandle>
  );
};
