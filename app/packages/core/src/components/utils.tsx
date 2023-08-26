import { useTheme } from "@fiftyone/components";
import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring, useSprings } from "@react-spring/web";

export const Box = styled.div`
  padding: 1em;
  box-sizing: border-box;
  background-color: ${({ theme }) => theme.background.body};
`;

export const VerticalSpacer = styled.div`
  height: ${({ height }) =>
    typeof height == "number" ? height + "px" : height};
  background-color: ${({ opaque, theme }) =>
    opaque ? theme.background.body : undefined};
`;

export const ContentDiv = styled.div`
  box-sizing: border-box;
  border-radius: 3px;
  background-color: ${({ theme }) => theme.background.level3};
  color: ${({ theme }) => theme.text.secondary};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
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
  color: ${({ theme }) => theme.text.primary};
  display: flex;
  padding-bottom: 0.5rem;
`;

export const PopoutDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.custom.shadow};
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
  border-bottom: 1px solid ${({ theme }) => theme.background.level1};
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
    flex-direction: column;
    align-content: center;
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
  color?: string;
};

export const TabOption = ({ active, options, color }: TabOptionProps) => {
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
          : theme.background.level2,
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
            color: theme.text.primary,
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

export const Button: React.FC<
  React.PropsWithChildren<{
    color?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    style?: React.CSSProperties;
    text?: string;
    title?: string;
  }>
> = ({
  onClick,
  text,
  children = null,
  style = {},
  color = null,
  title = null,
}) => {
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  color = color ?? theme.primary.plainColor;
  const props = useSpring({
    backgroundColor: hover ? color : theme.background.body,
    color: hover ? theme.text.buttonHighlight : theme.text.secondary,
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
      data-cy={`button-${title ?? text}`}
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
