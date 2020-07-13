import React from "react";
import styled from "styled-components";

const Tag = styled.div`
  margin-top: 0.5rem;
  float: right;
  height: 2rem;
  line-height: 2rem;
  position: relative;
  font-size: 1rem;
  margin-left: calc(5rem / 6);
  padding: 0 calc(5rem / 6) 0 1rem;
  color: #fff;
  text-decoration: none;

  &:before {
    content: "";
    float: left;
    position: absolute;
    top: 0;
    left: -1rem;
    width: 0;
    height: 0;
    border-color: transparent #0089e0 transparent transparent;
    border-style: solid;
    border-width: 1rem 1rem 1rem 0;
  }
`;

export default ({ name, color }) => {
  return <Tag>{name}</Tag>;
};
