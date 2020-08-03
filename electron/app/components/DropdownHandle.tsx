import React from "react";
import styled from "styled-components";
import { Add, ExpandLess, ExpandMore, Remove } from "@material-ui/icons";

import CellHeader from "./CellHeader";

const DropdownHandle = styled(CellHeader)`
  width: 15rem;

  svg {
    font-size: 1.25em;
  }
`;

type Props = {
  label: string;
  expanded: boolean;
  onClick: () => void;
  icon: (expanded: boolean) => ReactNode;
};

export const ArrowButton = (expanded) =>
  expanded ? <ExpandLess /> : <ExpandMore />;
export const PlusMinusButton = (expanded) => (expanded ? <Remove /> : <Add />);

export default ({
  label,
  expanded,
  onClick,
  icon = ArrowButton,
  ...rest
}: Props) => {
  return (
    <DropdownHandle icon={icon(expanded)} onClick={onClick} {...rest}>
      {label}
    </DropdownHandle>
  );
};
