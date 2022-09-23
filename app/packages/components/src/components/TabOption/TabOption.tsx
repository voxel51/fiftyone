import { useTheme } from "../ThemeProvider";
import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring, useSprings } from "@react-spring/web";

const Tab = animated(styled.div``);

const TabOptionDiv = animated(styled.div`
  display: flex;
  font-weight: bold;
  cursor: pointer;
  justify-content: space-between;
  margin: 0.5rem -0.5rem;
  height: 2rem;

  & > div {
    display: flex;
    justify-content: center;
    align-content: center;
    flex-direction: column;
    cursor: inherit;
    flex-grow: 1;
    flex-basis: 0;
    text-align: center;Checkbox
    overflow: hidden;
  }
`);

type TabOption = {
  text: string;
  onClick: () => void;
  title: string;
};

export type TabOptionProps = {
  active: string;
  options: TabOption[];
  color?: string;
};

export default ({ active, options, color }: TabOptionProps) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(options.map((o) => false));
  const styles = useSprings(
    options.length,
    options.map((o, i) => ({
      backgroundColor:
        o.text === active
          ? color || theme.primary.plainColor
          : hovering[i]
          ? theme.background.body
          : theme.background.level1,
      color: hovering ? theme.text.primary : theme.text.secondary,
    }))
  );

  const [style, set] = useSpring(() => ({
    background: theme.background.level1,
  }));

  return (
    <TabOptionDiv
      style={style}
      onMouseEnter={() => set({ background: theme.background.body })}
      onMouseLeave={() => set({ background: theme.background.level1 })}
    >
      {options.map(({ text, title, onClick }, i) => (
        <Tab
          onClick={onClick}
          title={title}
          style={{
            ...styles[i],
            cursor: text === active ? "default" : "pointer",
          }}
          onMouseEnter={() =>
            setHovering(hovering.map((_, j) => (j === i ? true : _)))
          }
          onMouseLeave={() =>
            setHovering(hovering.map((_, j) => (j === i ? false : _)))
          }
          key={i}
        >
          {text}
        </Tab>
      ))}
    </TabOptionDiv>
  );
};
