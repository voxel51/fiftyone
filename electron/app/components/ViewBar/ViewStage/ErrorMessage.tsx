import React, { useChain, useEffect, useRef, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { useService } from "@xstate/react";

const ErrorMessageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.error};
  background-color: ${({ theme }) => theme.backgroundDark};
  color: ${({ theme }) => theme.fontDark};
  border-radius: 2px;
  padding: 0.5rem;
  line-height: 1rem;
  margin-top: 2.5rem;
  font-weight: bold;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  position: fixed;
  width: auto;
  z-index: 800;
`);

const ErrorMessage = React.memo(({ serviceRef, style }) => {
  const [state, send] = useService(serviceRef);
  const [errorIdTimeout, setErrorIdTimeout] = useState(null);
  const [errorTimeout, setErrorTimeout] = useState(null);
  const { error, errorId } = state.context;
  const animations = useSpring({
    opacity: errorId ? 1 : 0,
    from: {
      opacity: 0,
    },
  });

  useEffect(() => {
    errorTimeout && clearTimeout(errorTimeout);
    errorIdTimeout && clearTimeout(errorIdTimeout);
    errorId &&
      setErrorIdTimeout(
        setTimeout(() => {
          send("CLEAR_ERROR_ID");
          setErrorTimeout(setTimeout(() => send("CLEAR_ERROR"), 1000));
        }, 2000)
      );
  }, [errorId]);

  return (
    <ErrorMessageDiv
      style={{ ...animations, display: error ? "block" : "none", ...style }}
    >
      {error}
    </ErrorMessageDiv>
  );
});

export default ErrorMessage;
