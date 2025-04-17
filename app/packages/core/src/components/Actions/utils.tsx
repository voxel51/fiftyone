import { useTheme } from "@fiftyone/components";
import { animated, useSpring } from "@react-spring/web";
import { useState } from "react";
import styled from "styled-components";

export const ActionDiv = styled.div`
  position: relative;
`;

export const SwitcherDiv = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.background.body};
  display: flex;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
`;

export const SwitchDiv = animated(styled.div`
  flex-basis: 0;
  flex-grow: 1;
  font-size: 1rem;
  padding-left: 0.4rem;
  line-height: 2;
  font-weight: bold;
  border-bottom-color: ${({ theme }) => theme.primary.plainColor};
  border-bottom-style: solid;
  border-bottom-width: 2px;
  text-transform: capitalize;
`);

export const useHighlightHover = (
  disabled: boolean,
  override: null | boolean = null,
  color: null | string = null
) => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const on =
    typeof override === "boolean"
      ? override && !disabled
      : hovering && !disabled;
  const style = useSpring({
    backgroundColor: on ? theme.background.level1 : theme.background.level2,
    color: color ? color : on ? theme.text.primary : theme.text.secondary,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      ...style,
      cursor: disabled ? "default" : "pointer",
    },
    onMouseEnter,
    onMouseLeave,
  };
};

/**
 * This function is used to filter out non-string or non-number props. Like
 * functions and objects
 */
export const getStringAndNumberProps = (props?: Record<string, unknown>) => {
  if (!props) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(props).filter(
      ([_key, value]) => typeof value === "string" || typeof value === "number"
    )
  );
};
