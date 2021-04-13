import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring, useSprings } from "react-spring";
import { KeyboardArrowUp, KeyboardArrowDown } from "@material-ui/icons";

import { useTheme } from "../utils/hooks";

export const Box = styled.div`
  padding: 1em;
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.background};
`;

export const VerticalSpacer = styled.div`
  height: ${({ height }) =>
    typeof height == "number" ? height + "px" : height};
  background-color: ${({ opaque, theme }) =>
    opaque ? theme.background : undefined};
`;

export const Button = styled.button`
  display: flex;
  align-items: center;
  background-color: ${({ theme }) => theme.button};
  color: ${({ theme }) => theme.font};
  border: 1px solid ${({ theme }) => theme.buttonBorder};
  border-radius: 1px;
  margin: 0 3px;
  padding: 3px 10px;
  font-weight: bold;
  cursor: pointer;

  svg.MuiSvgIcon-root {
    font-size: 1.25em;
    margin-left: -3px;
    margin-right: 3px;
  }
`;

export const ModalWrapper = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.overlay};
`;

export const ModalFooter = styled.div`
  display: block;
  border-top: 2px solid ${({ theme }) => theme.border};
  padding: 1em;
  background-color: ${({ theme }) => theme.backgroundLight};
  z-index: 9000;
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 64.5px;
`;

export const scrollbarStyles = ({ theme }) => `
::-webkit-scrollbar {
  width: 16px;
}
scrollbar-width: none;
@-moz-document url-prefix() {
  padding-right: 16px;
}

::-webkit-scrollbar-track {
  border: solid 4px transparent ${theme.fontDarkest};
}

::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px transparent;
  border: solid 4px transparent;
  border-radius: 16px;
  transition: box-shadow linear 0.5s;
}
&:hover::-webkit-scrollbar-thumb {
  box-shadow: inset 0 0 10px 10px ${theme.fontDarkest};
}
`;

export const ContentDiv = styled.div`
  box-sizing: border-box;
  border-radius: 3px;
  background-color: ${({ theme }) => theme.backgroundDarker};
  color: ${({ theme }) => theme.fontDark};
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  padding: 0.5rem;
  line-height: 1rem;
  margin-top: 2.5rem;
  font-weight: bold;
  width: auto;
  z-index: 802;
`;

export const ContentHeader = styled.div`
  color: ${({ theme }) => theme.font};
  display: flex;
  padding-bottom: 0.5rem;
`;

const PillButtonDiv = animated(styled.div`
  line-height: 1.5rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  background-color: ${({ theme }) => theme.button};
  height: 2rem;
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  opacity: 1;

  & > span {
    margin: 0 0.25rem;
  }
  & > svg {
    display: inline-block;
    height: 100%;
  }
`);

type PillButton = {
  onClick: (event: Event) => void;
  open: boolean;
  highlight: boolean;
  text?: string;
  icon?: any;
  arrow?: boolean;
  style?: object;
  title?: string;
};

export const PillButton = React.memo(
  React.forwardRef(
    (
      {
        onClick,
        open,
        text,
        icon,
        highlight,
        arrow = false,
        style,
        title,
      }: PillButton,
      ref
    ) => {
      const theme = useTheme();
      const props = useSpring({
        backgroundColor: !highlight ? theme.button : theme.brand,
      });
      return (
        <PillButtonDiv
          onClick={onClick}
          ref={ref}
          style={{ ...props, ...style }}
          title={title}
        >
          {text && <span>{text}</span>}
          {icon}
          {arrow && (open ? <KeyboardArrowUp /> : <KeyboardArrowDown />)}
        </PillButtonDiv>
      );
    }
  )
);

export const PopoutDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 0.6rem;
  position: absolute;
  width: auto;
  z-index: 801;
  font-size: 14px;
  padding: 0 0.5rem 0 0.5rem;
  min-width: 14rem;
`);

export const PopoutSectionTitle = styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.backgroundLight};
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
`;

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
    text-align: center;
    overflow: hidden;
  }
`);

const Tab = animated(styled.div``);

type TabOption = {
  text: string;
  onClick: () => void;
  title: string;
};

export type TabOptionProps = {
  active: string;
  options: TabOption[];
};

export const TabOption = ({ active, options }: TabOptionProps) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(options.map((o) => false));
  const styles = useSprings(
    options.length,
    options.map((o, i) => ({
      backgroundColor:
        o.text === active
          ? theme.brand
          : hovering[i]
          ? theme.background
          : theme.backgroundLight,
      color: hovering ? theme.font : theme.fontDark,
    }))
  );

  const [style, set] = useSpring(() => ({
    background: theme.backgroundLight,
  }));

  return (
    <TabOptionDiv
      style={style}
      onMouseEnter={() => set({ background: theme.background })}
      onMouseLeave={() => set({ background: theme.backgroundLight })}
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
