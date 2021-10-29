import React, { ReactNode } from "react";
import styled from "styled-components";
import { Add, ExpandLess, ExpandMore, Remove } from "@material-ui/icons";

const Body = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.background};
  cursor: ${({ clickable }) => (clickable ? "pointer" : undefined)};
  font-weight: bold;
  user-select: none;
  border-radius: 3px;
  .icon {
    float: right;
    order: 1;
  }
  width: 100%;
  padding: 0.5rem;
  svg {
    font-size: 1.25em;
    vertical-align: middle;
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

const DropdownHandle = ({
  label,
  expanded,
  onClick,
  icon = ArrowButton,
  ...rest
}: Props) => {
  return (
    <Body icon={icon(expanded)} onClick={onClick} {...rest}>
      <span className="icon">{icon}</span>
      {label}
    </Body>
  );
};

export default DropdownHandle;
