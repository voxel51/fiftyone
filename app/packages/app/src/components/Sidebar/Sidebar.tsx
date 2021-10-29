import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import { useTheme } from "../../utils/hooks";

import SampleTagsCell from "./SampleTags";

const ButtonDiv = animated(styled.div`
  cursor: pointer;
  margin-left: 0;
  margin-right: 0;
  padding: 2.5px 0.5rem;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
`);

const OptionTextDiv = animated(styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: inherit;
  line-height: 1.7;
  & > span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
`);

export const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
};

export const Button = ({
  onClick,
  text,
  children = null,
  style,
  color = null,
  title = null,
}) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  color = color ?? theme.brand;
  const props = useSpring({
    backgroundColor: hover ? color : theme.background,
    color: hover ? theme.font : theme.fontDark,
    config: {
      duration: 150,
    },
  });
  return (
    <ButtonDiv
      style={{ ...props, userSelect: "none", ...style }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title ?? text}
    >
      <OptionText style={{ fontWeight: "bold", width: "100%" }}>
        {text}
      </OptionText>
      {children}
    </ButtonDiv>
  );
};

type FieldsSidebarProps = {
  modal: boolean;
};

const FieldsSidebar = ({ modal }: FieldsSidebarProps) => {
  return (
    <>
      <SampleTagsCell modal={modal} />
    </>
  );
};

export default FieldsSidebar;
