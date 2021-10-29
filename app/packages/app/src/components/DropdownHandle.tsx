import React, { CSSProperties, ReactNode } from "react";
import styled from "styled-components";
import { Add, ExpandLess, ExpandMore, Remove } from "@material-ui/icons";

const Body = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.background};
  cursor: pointer;
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
  expanded: boolean;
  onClick: () => void;
  icon?: (expanded: boolean) => ReactNode;
  style?: CSSProperties;
  children?: ReactNode;
};

export const ArrowButton = (expanded) =>
  expanded ? <ExpandLess /> : <ExpandMore />;

export const PlusMinusButton = (expanded) => (expanded ? <Remove /> : <Add />);

const DropdownHandle = ({
  children,
  expanded,
  onClick,
  icon = ArrowButton,
  ...rest
}: Props) => {
  return (
    <Body onClick={onClick} {...rest}>
      <span className="icon">{icon(expanded)}</span>
      {children}
    </Body>
  );
};

export default DropdownHandle;
