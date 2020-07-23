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
  onExpand: (expanded: boolean) => void;
};

export default ({ children, label, expanded, onExpand }: Props) => {
  const onExpandWrapper = onExpand ? () => onExpand(!expanded) : undefined;

  return (
    <Wrapper>
      <Header
        label={label}
        expanded={expanded}
        onClick={onExpandWrapper}
        icon={PlusMinusButton}
      />
      {expanded ? <Body>{children}</Body> : null}
    </Wrapper>
  );
};
