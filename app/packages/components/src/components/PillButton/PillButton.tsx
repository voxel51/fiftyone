import { Tooltip, useTheme } from "@fiftyone/components";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { animated, useSpring } from "@react-spring/web";
import React from "react";
import styled from "styled-components";

const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(
  (props, ref) => {
    const {
      onClick,
      id,
      open,
      text,
      icon,
      highlight,
      arrow = false,
      style,
      title,
      ...otherProps
    } = props;
    const theme = useTheme();
    const baseStyles = useSpring({
      backgroundColor: !highlight
        ? theme.background.button
        : theme.primary.plainColor,
      color: !highlight ? theme.text.secondary : theme.text.buttonHighlight,
    });

    const children = (
      <PillButtonDiv
        {...otherProps}
        onClick={(e: MouseEvent) => {
          onClick(e);
        }}
        onMouseDown={(e: MouseEvent) => {
          e.stopPropagation();
        }}
        id={id}
        ref={ref}
        style={{ ...baseStyles, ...style }}
        title={title}
      >
        {text && <span>{text}</span>}
        {icon}
        {arrow && (open ? <KeyboardArrowUp /> : <KeyboardArrowDown />)}
      </PillButtonDiv>
    );
    return title ? <Tooltip text={title}>{children}</Tooltip> : <>{children}</>;
  }
);

type PillButtonProps = {
  onClick: (event: Event) => void;
  id?: string;
  open?: boolean;
  highlight?: boolean;
  text?: string;
  icon?: JSX.Element;
  arrow?: boolean;
  style?: React.CSSProperties;
  title: string;
};

const PillButtonDiv = animated(styled.div`
  line-height: 1.5rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  background-color: ${({ theme }) => theme.divider};
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

PillButton.displayName = "PillButton";

export default React.memo(PillButton);
