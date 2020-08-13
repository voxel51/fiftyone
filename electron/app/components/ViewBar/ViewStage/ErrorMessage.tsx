import React, { useEffect, useState } from "react";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";
import { useService } from "@xstate/react";

const ErrorMessageDiv = animated(styled.div`
  box-sizing: border-box;
  border: 2px solid ${({ theme }) => theme.error};
  background-color: ${({ theme }) => theme.errorTransparent};
  border-radius: 2px;
  padding: 0.5rem;
  font-weight: bold;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 800;
  margin-left: -0.25rem;
`);

const ErrorMessage = React.memo(({ parameterRef }) => {
  const [state, send] = useService(parameterRef);
  const [errorTimeout, setErrorTimeout] = useState(null);
  const { error, clearErrorId } = state.context;
  const props = useSpring({
    opacity: error ? 1 : 0,
    display: error ? "block" : "none",
    from: {
      opacity: error ? 0 : 1,
      display: error ? "none" : "block",
    },
  });

  useEffect(() => {
    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }
    if (clearErrorId) {
      setErrorTimeout(
        clearErrorId ? setTimeout(() => send("CLEAR_ERROR"), 2000) : null
      );
    }
  }, [clearErrorId]);

  return <ErrorMessageDiv style={props}>{error}</ErrorMessageDiv>;
});

export default ErrorMessage;
