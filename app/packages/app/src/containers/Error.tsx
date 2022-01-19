import { Clear, FileCopy, Refresh } from "@material-ui/icons";
import React from "react";
import { useCopyToClipboard } from "react-use";
import { useResetRecoilState } from "recoil";
import styled from "styled-components";

import Header from "../components/Header";
import { scrollbarStyles } from "../components/utils";
import { stateDescription } from "../recoil/atoms";

import socket, { http } from "../shared/connection";
import { useRefresh } from "../utils/hooks";
import { packageMessage } from "../utils/socket";

const ErrorWrapper = styled.div`
  width: 100%;
  overflow: auto;

  ${scrollbarStyles}
`;

const ErrorContainer = styled.div`
  width: 80%;
  padding: 3rem 1rem;
  margin: 0 auto;
`;

const ErrorHeading = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 1.4rem;
  color: ${({ theme }) => theme.font};
  font-weight: bold;

  & > div {
    display: flex;
    justify-content: lrt;
  }
  & > div > div {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-left: 0.5rem;
  }

  & svg {
    cursor: pointer;
  }
`;

const ErrorMessage = styled.div`
  font-weight: bold;
  text-align: center;
`;

const Stack = styled.div`
  border: 1px solid #191c1f;
  border-top: 2px solid ${({ theme }) => theme.brand};
  background: ${({ theme }) => theme.backgroundDark};
  border-radius: 2px;
  color: ${({ theme }) => theme.font};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
  text-align: left;
  font-weight: normal;
  font-size: 1rem;

  overflow: auto;
  text-wrap: nowrap;
  ${scrollbarStyles}

  & > div {
    white-space: nowrap;
  }
`;

const Error = ({ error = null, resetErrorBoundary }) => {
  const [_, copy] = useCopyToClipboard();
  const resetState = useResetRecoilState(stateDescription);

  const refresh = useRefresh();
  return (
    <>
      <Header error={true} />
      <ErrorWrapper>
        <ErrorContainer>
          <ErrorHeading>
            <div>{error.kind ? error.kind : "App Error"}</div>
            <div>
              <div>
                <span
                  title={"Clear session"}
                  onClick={() => {
                    fetch(`${http}/dataset`, {
                      method: "POST",
                      cache: "no-cache",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      mode: "cors",
                      body: JSON.stringify({ dataset: null }),
                    }).then(() => {
                      resetState();
                      refresh();
                      resetErrorBoundary();
                    });
                  }}
                >
                  <Clear />
                </span>
              </div>
              <div>
                <span
                  title={"Refresh page"}
                  onClick={() => {
                    refresh();
                    resetErrorBoundary();
                  }}
                >
                  <Refresh />
                </span>
              </div>
              <div>
                <span title={"Copy stack"} onClick={() => copy(error.stack)}>
                  <FileCopy />
                </span>
              </div>
            </div>
          </ErrorHeading>
          <ErrorMessage>
            {error.stack && (
              <Stack>
                {error.stack.split("\n").map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </Stack>
            )}
          </ErrorMessage>
        </ErrorContainer>
      </ErrorWrapper>
    </>
  );
};

export default Error;
