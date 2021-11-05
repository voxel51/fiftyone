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

  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  svg {
    font-size: 1.25em;
    vertical-align: middle;
  }
`;

export type DropdownHandleProps = {
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
}: DropdownHandleProps) => {
  return (
    <Body
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      {...rest}
    >
      {children}
      <span className="icon">{icon(expanded)}</span>
    </Body>
  );
};

export default DropdownHandle;
