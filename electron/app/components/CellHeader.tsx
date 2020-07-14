import React from "react";
import styled from "styled-components";

const CellHeader = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid #e0e0e0;
  background-color: #ffffff;

  .icon {
    float: right;
  }
`;

export default ({ children, icon, ...props }) => {
  return (
    <CellHeader {...props}>
      {children}
      {icon ? <span class="icon">{icon}</span> : null}
    </CellHeader>
  );
};
