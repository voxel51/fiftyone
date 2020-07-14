import React from "react";
import styled from "styled-components";

const CellHeader = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid #e0e0e0;
  background-color: #ffffff;
  cursor: ${({ clickable }) => (clickable ? "pointer" : undefined)};

  .icon {
    float: right;
  }
`;

type Props = {
  clickable: boolean;
};

export default ({ children, icon, clickable, ...props }: Props) => {
  return (
    <CellHeader clickable={clickable} {...props}>
      {icon ? <span class="icon">{icon}</span> : null}
      {children}
    </CellHeader>
  );
};
