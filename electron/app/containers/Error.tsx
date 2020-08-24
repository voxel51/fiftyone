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
  text-align: center;
`;

const ReloadButton = styled.button``;

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
        <ErrorMessage>
          <p>Oops. We made an error.</p>
          <br />
          <p>
            Resetting your session view to it's last valid state often works.
            And then reload App.
          </p>
          <ReloadButton>Reload</ReloadButton>
        </ErrorMessage>
      </ErrorDiv>
    </ErrorContainer>
  );
};

export default Error;
