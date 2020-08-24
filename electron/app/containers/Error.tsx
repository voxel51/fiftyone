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

const Code = styled.code`
  background: ${({ theme }) => theme.backgroundDark};
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
  color: ${({ theme }) => theme.secondary};
  padding: 0.5rem;
`;

const ReloadButton = styled.button`
  display: block;
  margin: 1rem auto 0 auto;
  padding: 0.5rem;
  background: ${({ theme }) => theme.backgroundDark};
  color: ${({ theme }) => theme.fontDark};
  border: none;
  border-radius: 2px;
  font-weight: bold;
  color: ${({ theme }) => theme.font};
  cursor: pointer;

  &:focus {
    outline: none;
  }
`;

const LogoImg = styled.img`
  width: 5rem;
  height: 5rem;
  margin: 0 auto 1rem;
  display: block;
`;

const Error = ({ resetErrorBoundary }) => {
  return (
    <ErrorContainer>
      <ErrorDiv>
        <LogoImg src={logo} />
        <ErrorMessage>
          <p>Oops. We made an error.</p>
          <p>
            Resetting your session view to its last valid state often fixes
            things. And then reload the App.
          </p>
          <Code>session.view = ...</Code>
          <ReloadButton onClick={resetErrorBoundary}>Reload App</ReloadButton>
        </ErrorMessage>
      </ErrorDiv>
    </ErrorContainer>
  );
};

export default Error;
