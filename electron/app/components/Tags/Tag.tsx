import React from "react";
import styled from "styled-components";

const Container = styled.div`
  display: inline-block;
  background-color: ${({ fillColor }) => fillColor};
  height: 1em;
  margin: 0 2px 0 2px;
  padding: 3px 12px 3px 12px;
  color: white;
  font-size: 14px;
  line-height: 12px;
  border-radius: 9px;
  font-weight: bold;
  text-align: center;
`;

const Tag = ({ name, color = "blue" }) => {
  return <Container fillColor={color}>{name}</Container>;
};

export default Tag;
