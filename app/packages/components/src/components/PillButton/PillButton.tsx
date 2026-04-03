import { Tooltip } from "@fiftyone/components";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { TooltipProps } from "@mui/material";
import React from "react";
import styled from "styled-components";

const PillButton = React.forwardRef<
  HTMLButtonElement,
  PillButtonProps & { tooltipPlacement?: TooltipProps["placement"] }
>((props, ref) => {
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
    tooltipPlacement,
    ...otherProps
  } = props;
  const children = (
    <PillButtonDiv
      {...otherProps}
      $highlight={highlight}
      onClick={(e: MouseEvent) => {
        onClick(e);
      }}
      onMouseDown={(e: MouseEvent) => {
        e.stopPropagation();
      }}
      id={id}
      ref={ref}
      style={style}
    >
      {text && <span>{text}</span>}
      {icon}
      {arrow && (open ? <KeyboardArrowUp /> : <KeyboardArrowDown />)}
    </PillButtonDiv>
  );
  return title ? (
    <Tooltip placement={tooltipPlacement ?? "top-center"} text={title}>
      {children}
    </Tooltip>
  ) : (
    <>{children}</>
  );
});

type PillButtonProps = {
  arrow?: boolean;
  highlight?: boolean;
  icon?: JSX.Element;
  id?: string;
  onClick: (event: Event) => void;
  open?: boolean;
  style?: React.CSSProperties;
  text?: string;
  title: string;
};

const PillButtonDiv = styled.div.withConfig({
  shouldForwardProp: (prop) => {
    return !["variant", "color", "size", "$highlight"].includes(prop);
  },
})<{ $highlight?: boolean }>`
  display: flex;
  align-items: center;
  line-height: 1.5rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
  background-color: ${({ theme, $highlight }) =>
    $highlight ? theme.primary.plainColor : theme.background.button};
  color: ${({ theme, $highlight }) =>
    $highlight ? theme.text.buttonHighlight : theme.text.primary};
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  justify-content: space-between;
  opacity: 1;
  gap: 0.25rem;
  transition: background-color 150ms ease, color 150ms ease;

  &:hover {
    background-color: ${({ theme, $highlight }) =>
      $highlight ? theme.primary.plainColor : theme.background.level1};
  }

  & > span {
    text-align: center;
  }
  & > svg {
    display: inline-block;
    height: 100%;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:hover > svg {
    transform: translateY(-2px);
  }
`;

PillButton.displayName = "PillButton";

export default React.memo(PillButton);
