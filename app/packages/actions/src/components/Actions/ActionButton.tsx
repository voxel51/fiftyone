import { Tooltip } from "@fiftyone/components";
import { KeyboardArrowDownIcon, KeyboardArrowUpIcon } from "@voxel51/voodo";
import type { TooltipProps } from "@mui/material";
import React from "react";
import styled from "styled-components";

type ActionButtonProps = {
  arrow?: boolean;
  highlight?: boolean;
  icon?: JSX.Element;
  id?: string;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  open?: boolean;
  style?: React.CSSProperties;
  text?: string;
  title: string;
  tooltipPlacement?: TooltipProps["placement"];
};

const Button = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--color-content-text-secondary);
  background: transparent;
  transition:
    background-color 0.15s,
    color 0.15s;

  &:hover,
  &[data-active="true"] {
    color: var(--color-content-text-primary);
    background: var(--color-content-bg-card-nested);
  }
`;

/** A toolbar action: icon, optional label and caret, quiet until hovered or on. */
const ActionButton = React.forwardRef<HTMLDivElement, ActionButtonProps>(
  (
    {
      arrow = false,
      highlight,
      icon,
      id,
      onClick,
      open,
      style,
      text,
      title,
      tooltipPlacement,
      ...otherProps
    },
    ref,
  ) => {
    const button = (
      <Button
        {...otherProps}
        data-active={Boolean(highlight)}
        id={id}
        ref={ref}
        style={style}
        onClick={onClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {icon}
        {text && <span>{text}</span>}
        {arrow &&
          (open ? (
            <KeyboardArrowUpIcon size={14} />
          ) : (
            <KeyboardArrowDownIcon size={14} />
          ))}
      </Button>
    );

    return title ? (
      <Tooltip placement={tooltipPlacement ?? "top-center"} text={title}>
        {button}
      </Tooltip>
    ) : (
      button
    );
  },
);

ActionButton.displayName = "ActionButton";

export default React.memo(ActionButton);
