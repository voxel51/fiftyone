import React from "react";
import styled from "styled-components";

const HEIGHT = 24;
const BORDER = 2;

const OuterRectangle = styled.div`
  position: relative;
  display: inline-block;
  margin-left: ${({ hasTriangle }) => (hasTriangle ? `${HEIGHT / 2}px` : 0)};
  padding-right: ${BORDER}px;
  height: ${HEIGHT}px;
  line-height: ${HEIGHT / 2}px;
  background-color: ${({ borderColor }) => borderColor};
`;

const OuterTriangle = styled.div`
  position: absolute;
  top: 0;
  left: -${HEIGHT / 2}px;
  width: 0;
  height: 0;
  border-color: transparent ${({ borderColor }) => borderColor} transparent
    transparent;
  border-style: solid;
  border-width: ${HEIGHT / 2}px ${HEIGHT / 2}px ${HEIGHT / 2}px 0;
`;

const InnerRectangle = styled.div`
  position: relative;
  display: inline-block;
  top: ${BORDER}px;
  left: ${({ hasTriangle }) => (hasTriangle ? 0 : `${BORDER}px`)};
  margin-right: ${({ hasTriangle }) => (hasTriangle ? 0 : `${BORDER}px`)};
  padding: 0 ${BORDER * 3}px 0 ${BORDER * 3}px;
  height: ${HEIGHT - 2 * BORDER}px;
  font-size: ${HEIGHT - 2 * BORDER}px;
  line-height: ${HEIGHT / 2}px;
  color: ${({ textColor }) => textColor};
  background-color: ${({ fillColor }) => fillColor};
  text-decoration: none;
`;

const InnerTriangle = styled.div`
  position: absolute;
  top: ${BORDER}px;
  left: -${HEIGHT / 2 - BORDER}px;
  width: 0;
  height: 0;
  border-color: transparent ${({ fillColor }) => fillColor} transparent
    transparent;
  border-style: solid;
  border-width: ${HEIGHT / 2 - BORDER}px ${HEIGHT / 2 - BORDER}px
    ${HEIGHT / 2 - BORDER}px 0;
`;

const Tag = ({ name, color = "blue", selected = false, triangle = false }) => {
  const fillColor = selected ? color : "white";
  return (
    <OuterRectangle borderColor={color} hasTriangle={triangle}>
      {triangle ? (
        <>
          <OuterTriangle borderColor={color} />
          <InnerTriangle fillColor={fillColor} />
        </>
      ) : null}
      <InnerRectangle
        hasTriangle={triangle}
        fillColor={fillColor}
        textColor={selected ? "white" : color}
      >
        {name}
      </InnerRectangle>
    </OuterRectangle>
  );
};

export default Tag;
