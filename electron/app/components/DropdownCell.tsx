import React from "react";
import styled from "styled-components";

import { Box } from "./utils";
import DropdownHandle, { PlusMinusButton } from "./DropdownHandle";

const StandardWrapper = styled.div``;

const BoxedWrapper = styled.div`
  margin-bottom: -2px;
`;

const BoxedHeader = styled(DropdownHandle)`
  width: 100% !important;
`;

const StandardHeader = styled(BoxedHeader)`
  border-radius: 0;
  border-width: 0 0 1px 0;
  padding: 0.5em 0 0.5em 0;
  width: 100%;
`;

const StandardBody = styled.div`
  width: 100%;
  padding-top: 0.5em;
  margin-bottom: 1em;
`;

const BoxedBody = styled(Box)`
  width: 100%;
  border-top: none;
`;

type Props = {
  label: string;
  title: string;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  boxed: boolean;
};

const DropdownCell = ({
  children,
  label,
  title,
  expanded,
  onExpand,
  boxed = false,
}: Props) => {
  const onExpandWrapper = onExpand ? () => onExpand(!expanded) : undefined;

  const Wrapper = boxed ? BoxedWrapper : StandardWrapper;
  const Header = boxed ? BoxedHeader : StandardHeader;
  const Body = boxed ? BoxedBody : StandardBody;

  return (
    <Wrapper>
      <Header
        label={label}
        title={title}
        expanded={expanded}
        onClick={onExpandWrapper}
        icon={PlusMinusButton}
      />
      {expanded ? <Body>{children}</Body> : null}
    </Wrapper>
  );
};

export default DropdownCell;
