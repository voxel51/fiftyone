import React from "react";
import styled from "styled-components";
import { EmptyHeader } from "../components/Header";

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

const Stack = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
  text-align: left;
`;

const Error = ({ resetErrorBoundary, error = null }) => {
  console.log(error.stack);
  return (
    <>
      <EmptyHeader text={"Oops! Something went wrong."} />
      <ErrorContainer>
        <ErrorDiv>
          <ErrorMessage>
            <p></p>
            <p>If you just changed your view, try reverting your changes:</p>
            <Code>session.view = old_view</Code>
            <div>
              And then{" "}
              <ReloadButton onClick={resetErrorBoundary}>
                Reload the App
              </ReloadButton>{" "}
              to try again.
            </div>
            {error.stack && (
              <Stack>
                {error.stack.split("\n").map((line) => (
                  <div>{line}</div>
                ))}
              </Stack>
            )}
          </ErrorMessage>
        </ErrorDiv>
      </ErrorContainer>
    </>
  );
};

export default Error;
