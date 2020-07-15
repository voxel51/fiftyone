import React from "react";
import styled from "styled-components";

import { Box } from "./utils";

const CellHeader = styled(Box)`
  cursor: ${({ clickable }) => (clickable ? "pointer" : undefined)};
  font-weight: bold;

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
