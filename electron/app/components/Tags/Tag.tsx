import React from "react";
import styled from "styled-components";

const Tag = styled.div`
  width: 1rem;
  height: 1rem;
  background: black;
`;

export default ({ children }) => {
  return <Tag>{children}</Tag>;
};
