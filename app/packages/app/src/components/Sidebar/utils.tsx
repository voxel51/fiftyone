import { Visibility } from "@material-ui/icons";
import React, { ReactNode, useState } from "react";
import { animated, useSpring } from "@react-spring/web";
import styled from "styled-components";

import { useTheme } from "../../utils/hooks";

import { PillButton } from "../utils";

export type PillEntry = {
  onClick: () => void;
  active: string[];
  title: string;
  icon?: ReactNode;
};

export const usePills = (entries: PillEntry[]): JSX.Element[] => {
  const theme = useTheme();

  return entries.map((data) => (
    <PillButton
      {...data}
      text={`${data.active.length}`}
      highlight={false}
      open={false}
      style={{
        height: "1.5rem",
        fontSize: "0.8rem",
        lineHeight: "1rem",
        color: theme.font,
      }}
    />
  ));
};

type MatchEyeProps = {
  name: string;
  elementsName: string;
  onClick: () => void;
  matched: Set<string>;
};

export const MatchEye = ({
  elementsName,
  name,
  matched,
  onClick,
}: MatchEyeProps) => {
  const theme = useTheme();
  const color = matched.has(name) ? theme.font : theme.fontDark;
  const title = `Only show ${elementsName} with the "${name}" tag ${
    matched.size ? "or other selected tags" : ""
  }`;

  return (
    <span
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Visibility
        style={{
          color,
          height: 20,
          width: 20,
        }}
      />
    </span>
  );
};

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
      <OptionText key={"button"} style={{ fontWeight: "bold", width: "100%" }}>
        {text}
      </OptionText>
      {children}
    </ButtonDiv>
  );
};
