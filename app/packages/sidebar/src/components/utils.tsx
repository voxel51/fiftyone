import { cssVar } from "@voxel51/voodo";
import React, { useState } from "react";
import styled from "styled-components";

export const ContentDiv = styled.div`
  box-sizing: border-box;
  border-radius: 3px;
  background-color: ${cssVar.color.bg.popover};
  color: ${cssVar.color.text.secondary};
  border: 1px solid ${cssVar.color.border.subtle};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  padding: 0.5rem;
  line-height: 1rem;
  margin-top: 2.5rem;
  font-weight: bold;
  width: auto;
  z-index: 802;
`;

export const ContentHeader = styled.div<{ $isTooltipLocked?: boolean }>`
  color: ${cssVar.color.text.primary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  cursor: ${({ $isTooltipLocked }) => ($isTooltipLocked ? "grab" : "default")};
`;

const ButtonDiv = styled.div<{ disabled?: boolean }>`
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  margin-left: 0;
  margin-right: 0;
  padding: 2.5px 0.5rem;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  transition:
    background-color 150ms,
    color 150ms;
`;

const OptionTextDiv = styled.div`
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
`;

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
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    style?: React.CSSProperties;
    text?: string | React.ReactNode;
    title?: string;
  }>
> = ({
  onClick,
  text,
  children = null,
  style = {},
  color = null,
  title = null,
  disabled = false,
}) => {
  const [hover, setHover] = useState(false);
  color = color ?? cssVar.color.brand.primary;
  const props = {
    backgroundColor: disabled
      ? cssVar.color.bg.background
      : hover
        ? color
        : cssVar.color.bg["card-nested"],
    color: disabled
      ? cssVar.color.text.secondary
      : hover
        ? cssVar.color.text.primary
        : cssVar.color.text.secondary,
  };
  return (
    <ButtonDiv
      style={{ ...props, userSelect: "none", ...style }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title ?? (typeof text === "string" ? text : "")}
      data-cy={`button-${title ?? text}`}
      disabled={disabled}
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
