import React from "react";
import styled from "styled-components";

const Outer = styled.div`
  display: inline-block;
  height: 2em;
  line-height: 2em;
  position: relative;
  margin-left: 1em;
  padding: 0 0.5em 0 0.5em;
  color: #fff;
  background-color: ${({ color }) => color};
  text-decoration: none;

  &:before {
    content: "";
    position: absolute;
    top: 0;
    left: -1em;
    width: 0;
    height: 0;
    border-color: transparent ${({ color }) => color} transparent transparent;
    border-style: solid;
    border-width: 1em 1em 1em 0;
  }
`;

const Tag = ({ name, color = "blue", selected = false }) => {
  return <Outer color={color}>{name}</Outer>;
};

export default Tag;
