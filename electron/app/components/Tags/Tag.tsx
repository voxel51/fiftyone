import React from "react";
import styled from "styled-components";

const HEIGHT = 24;
const BORDER = 2;

const Outer = styled.div`
  position: relative;
  display: inline-block;
  margin-left: ${HEIGHT / 2}px;
  padding-right: ${BORDER}px;
  height: ${HEIGHT}px;
  line-height: ${HEIGHT / 2}px;
  background-color: ${({ borderColor }) => borderColor};

  &:before {
    position: absolute;
    top: 0;
    left: -${HEIGHT / 2}px;
    width: 0;
    height: 0;
    content: "";
    border-color: transparent ${({ borderColor }) => borderColor} transparent
      transparent;
    border-style: solid;
    border-width: ${HEIGHT / 2}px ${HEIGHT / 2}px ${HEIGHT / 2}px 0;
  }
`;

const Inner = styled.div`
  position: relative;
  display: inline-block;
  top: ${BORDER}px;
  padding: 0 ${BORDER * 3}px 0 ${BORDER * 3}px;
  height: ${HEIGHT - 2 * BORDER}px;
  font-size: ${HEIGHT - 2 * BORDER}px;
  line-height: ${HEIGHT / 2}px;
  color: ${({ textColor }) => textColor};
  background-color: ${({ fillColor }) => fillColor};
  text-decoration: none;

  &:before {
    position: absolute;
    top: 0;
    left: -${HEIGHT / 2 - BORDER}px;
    width: 0;
    height: 0;
    content: "";
    border-color: transparent ${({ fillColor }) => fillColor} transparent
      transparent;
    border-style: solid;
    border-width: ${HEIGHT / 2 - BORDER}px ${HEIGHT / 2 - BORDER}px
      ${HEIGHT / 2 - BORDER}px 0;
  }
`;

const Tag = ({ name, color = "blue", selected = false }) => {
  return (
    <Outer borderColor={color}>
      <Inner
        fillColor={selected ? color : "white"}
        textColor={selected ? "white" : color}
      >
        {name}
      </Inner>
    </Outer>
  );
};

export default Tag;
