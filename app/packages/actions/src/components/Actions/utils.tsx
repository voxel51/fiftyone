import styled from "styled-components";

export const ActionDiv = styled.div.withConfig({
  shouldForwardProp: (prop) => {
    // Don't forward non-DOM props
    return !["variant", "closeOverflow", "refresh"].includes(prop);
  },
})`
  position: relative;
`;

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
