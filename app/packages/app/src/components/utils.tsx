import { Tooltip, useTheme } from "@fiftyone/components";
import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring, useSprings } from "@react-spring/web";
import { KeyboardArrowUp, KeyboardArrowDown } from "@material-ui/icons";

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

export const scrollbarStyles = ({ theme }) => `
::-webkit-scrollbar {
  width: 16px;
}

scrollbar-color: ${({ theme }) => theme.fontDarkest} ${({ theme }) =>
  theme.background};

  scrollbar-gutter: stable;

  scrollbar-width: auto;

::-webkit-scrollbar-track {
  border: solid 4px transparent ${theme.fontDarkest};
}

@-moz-document url-prefix() {
  padding-right: 16px;
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
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  opacity: 1;

  & > span {
    text-align: center;
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
  style?: React.CSSProperties;
  title: string;
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
        <Tooltip text={title}>
          <PillButtonDiv
            onClick={(e) => {
              onClick(e);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            ref={ref}
            style={{ ...props, ...style }}
            title={title}
          >
            {text && <span>{text}</span>}
            {icon}
            {arrow && (open ? <KeyboardArrowUp /> : <KeyboardArrowDown />)}
          </PillButtonDiv>
        </Tooltip>
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
  flex-direction: ${(props) => (props.rows ? "column" : "row")};
  cursor: pointer;
  justify-content: space-between;
  margin: 0.5rem -0.5rem;
  height: ${(props) => (props.rows ? "auto" : "2rem")};

  & > div {
    display: flex;
    justify-content: ${(props) => (props.rows ? "start" : "center")};
    padding: ${(props) => (props.rows ? "0.25rem 0 0.25rem 0.5rem" : "0")};
    align-content: center;
    cursor: inherit;
    flex-grow: 1;
    flex-basis: 0;
    text-align: ${(props) => (props.rows ? "left" : "center")};
    overflow: ${(props) => (props.rows ? "visible" : "hidden")};
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
  color?: string;
  rows?: boolean;
};

export const TabOption = ({ active, options, color, rows }: TabOptionProps) => {
  const theme = useTheme();
  const [hovering, setHovering] = useState(options.map((o) => false));
  const styles = useSprings(
    options.length,
    options.map((o, i) => ({
      backgroundColor:
        o.text === active
          ? color || theme.brand
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
      rows={rows}
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

export const NameAndCountContainer = styled.div`
  display: flex;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
  align-items: center;
  user-select: text;

  & > span {
    user-select: text;
  }

  & > span:first-child {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: 6px;
  }

  & span {
    margin-right: 6px;
  }
`;
