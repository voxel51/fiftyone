import React from "react";
import styled from "styled-components";

import logo from "../logo.png";

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
`;

const ErrorDiv = styled.div``;

const ErrorMessage = styled.div`
  font-weight: bold;

  & > p {
    font-weight: normal;
  }
`;

const LogoImg = styled.img`
  width: 5rem;
  height: 5rem;
  margin: 0 auto 1rem;
  display: block;
`;

const Error = () => {
  return (
    <ErrorContainer>
      <ErrorDiv>
        <LogoImg src={logo} />
        <ErrorMessage>Oops. We made an error.</ErrorMessage>
      </ErrorDiv>
    </ErrorContainer>
  );
};

export default Error;
