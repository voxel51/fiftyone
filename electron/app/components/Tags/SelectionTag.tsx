import React from "react";
import styled from "styled-components";

import Tag from "./Tag";

const Body = styled(Tag.Body)`
  background-color: transparent;
  color: ${({ theme }) => theme.font};
  border: 1px solid ${({ theme }) => theme.border};
  font-weight: normal;

  a {
    display: inline-block;
    margin-left: 5px;
    margin-right: -4px;
    cursor: pointer;
  }
`;

const SelectionTag = ({ count = 0, onClear, ...rest }) => {
  return (
    <Body {...rest}>
      {count} selected <a onClick={onClear}>&times;</a>
    </Body>
  );
};

SelectionTag.Body = Body;

export default SelectionTag;
