import React from "react";
import styled from "styled-components";

import { Box } from "./utils";

const Body = styled(Box)`
  cursor: ${({ clickable }) => (clickable ? "pointer" : undefined)};
  font-weight: bold;
  user-select: none;
  border-radius: 3px;

  .icon {
    float: right;
    order: 1;
  }
`;

type Props = {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
};

const CellHeader = ({ children, icon, onClick, ...props }: Props) => {
  const onClickWrapper = () => {
    if (onClick) {
      return onClick();
    }
  };

  return (
    <Body clickable={Boolean(onClick)} onClick={onClickWrapper} {...props}>
      {icon ? <span className="icon">{icon}</span> : null}
      {children}
    </Body>
  );
};

CellHeader.Body = Body;

export default CellHeader;
