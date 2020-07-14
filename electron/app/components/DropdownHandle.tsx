import React from "react";
import styled from "styled-components";

const DropdownHandle = styled.div`
  margin: 1rem;
  width: 15rem;
  padding: 1rem;
  box-sizing: border-box;
  border-radius: 0.2rem;
  border: 0.2rem solid #e0e0e0;
  background-color: #ffffff;
`;

export default ({label}) => {
  return <DropdownHandle>{label}</DropdownHandle>;
};
