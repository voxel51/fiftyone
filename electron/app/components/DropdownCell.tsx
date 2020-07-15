import React from "react";
import styled from "styled-components";

import { Box } from "./utils";
import DropdownHandle, { PlusMinusButton } from "./DropdownHandle";

const Wrapper = styled.div`
  margin-bottom: -2px;
`;

const Header = styled(DropdownHandle)`
  width: 15rem;
`;

const Body = styled(Box)`
  width: 15rem;
  border-top: none;
`;

type Props = {
  label: string;
  expanded: boolean;
};

export default ({ children, label, expanded }: Props) => {
  return (
    <Wrapper>
      <Header label={label} expanded={expanded} icon={PlusMinusButton} />
      {expanded ? <Body>{children}</Body> : null}
    </Wrapper>
  );
};
