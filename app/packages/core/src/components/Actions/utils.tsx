import { animated } from "@react-spring/web";
import styled from "styled-components";

export const ActionDiv = styled.div.withConfig({
  shouldForwardProp: (prop) => {
    // Don't forward non-DOM props
    return !["variant", "closeOverflow", "refresh"].includes(prop);
  },
})`
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
      ([_key, value]) => typeof value === "string" || typeof value === "number",
    ),
  );
};
