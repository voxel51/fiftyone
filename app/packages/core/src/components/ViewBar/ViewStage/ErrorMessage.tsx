import { ReportProblem } from "@mui/icons-material";
import { animated, config, useSpring } from "@react-spring/web";
import { useService } from "@xstate/react";
import styled from "styled-components";
import { useFollow, useOutsideClick } from "@fiftyone/state";
import { useTheme } from "@fiftyone/components";
import React, { useEffect, useRef, useState } from "react";

const ErrorMessageDiv = animated(styled.div`
  box-sizing: border-box;
  border-radius: 3px;
  background-color: ${({ theme }) => theme.background.level3};
  box-shadow: 0 2px 25px 0 ${({ theme }) => theme.primary.plainBorder};
  color: ${({ theme }) => theme.text.secondary};
  border-radius: 2px;
  padding: 0.5rem;
  line-height: 1rem;
  margin-top: 2.5rem;
  font-weight: bold;
  position: fixed;
  width: auto;
  z-index: 802;
`);

const ErrorHeader = styled.div`
  color: ${({ theme }) => theme.text.primary};
  display: flex;
  padding-bottom: 0.5rem;
`;

const ErrorMessage = React.memo(
  ({ barRef, followRef, serviceRef, style, machine }) => {
    const theme = useTheme();
    let state, send;
    if (machine) {
      [state, send] = machine;
    } else {
      [state, send] = useService(serviceRef);
    }
    const ref = useRef();
    const [errorTimeout, setErrorTimeout] = useState(null);
    const { error, errorId } = state.context;
    const [props, set] = useSpring(() => {
      const obj = followRef
        ? {
            left: followRef.current.getBoundingClientRect().x,
            top: followRef.current.getBoundingClientRect().y,
          }
        : {};
      return {
        ...obj,
        opacity: errorId ? 1 : 0,
        from: {
          opacity: 0,
        },
        config: config.stiff,
      };
    });

    useEffect(() => {
      errorTimeout && clearTimeout(errorTimeout);
      !errorId && setErrorTimeout(setTimeout(() => send("CLEAR_ERROR"), 1000));
      set({ opacity: errorId ? 1 : 0 });
    }, [errorId]);

    useOutsideClick(ref, () => send("CLEAR_ERROR_ID"));

    useFollow(barRef, followRef, set);

    return (
      <ErrorMessageDiv
        ref={ref}
        style={{ ...props, display: error ? "block" : "none", ...style }}
      >
        {error ? (
          <>
            <ErrorHeader>
              <ReportProblem
                style={{
                  color: theme.danger.plainColor,
                  marginRight: "0.5rem",
                }}
              />
              <div
                style={{ marginTop: "0.25rem" }}
              >{`Invalid ${error.name}.`}</div>
            </ErrorHeader>
            {error.error}
          </>
        ) : null}
      </ErrorMessageDiv>
    );
  }
);

export default ErrorMessage;
