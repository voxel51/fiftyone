import React from "react";
import styled from "styled-components";

const Outer = styled.div`
  position: relative;
  display: inline-block;
  margin-left: 1em;
  padding-right: 0.25em;
  height: 2em;
  line-height: 1em;
  background-color: ${({ borderColor }) => borderColor};

  &:before {
    position: absolute;
    top: 0;
    left: -1em;
    width: 0;
    height: 0;
    content: "";
    border-color: transparent ${({ borderColor }) => borderColor} transparent
      transparent;
    border-style: solid;
    border-width: 1em 1em 1em 0;
  }
`;

const Inner = styled.div`
  position: relative;
  display: inline-block;
  top: 0.25em;
  padding: 0 0.5em 0 0.5em;
  height: 1.5em;
  line-height: 1em;
  color: ${({ textColor }) => textColor};
  background-color: ${({ fillColor }) => fillColor};
  text-decoration: none;

  &:before {
    position: absolute;
    top: 0;
    left: -0.75em;
    width: 0;
    height: 0;
    content: "";
    border-color: transparent ${({ fillColor }) => fillColor} transparent
      transparent;
    border-style: solid;
    border-width: 0.75em 0.75em 0.75em 0;
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
