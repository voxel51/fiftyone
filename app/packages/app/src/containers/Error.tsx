import React from "react";
import styled from "styled-components";

import Logo from "../images/logo.png";

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
  display: inline-block;
  margin: 1rem 0.5rem;
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
        <LogoImg src={Logo} />
        <ErrorMessage>
          <p>Oops! Something went wrong.</p>
          <p>If you just changed your view, try reverting your changes:</p>
          <Code>session.view = old_view</Code>
          <div>
            And then{" "}
            <ReloadButton onClick={resetErrorBoundary}>
              Reload the App
            </ReloadButton>{" "}
            to try again.
          </div>
        </ErrorMessage>
      </ErrorDiv>
    </ErrorContainer>
  );
};

export default Error;
