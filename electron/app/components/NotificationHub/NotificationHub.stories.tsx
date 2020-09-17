import { ThemeProvider } from "@material-ui/core";
import React, { useContext, useRef } from "react";
import styled, { ThemeContext } from "styled-components";

import NotificationHub from "./NotificationHub";

export default {
  component: NotificationHub,
  title: "NotificationHub",
};

const Main = styled("div")`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  color: ${({ theme }) => theme.font};
`;

export const error = () => {
  const theme = useContext(ThemeContext);
  const ref = useRef(null);
  return (
    <Main
      onClick={() =>
        ref.current({
          title: "Title",
          titleColor: "hsl(0, 87%, 53%)",
          message: "message",
          die: false,
        })
      }
    >
      Click here to create notifications
      <NotificationHub children={(add) => (ref.current = add)} />
    </Main>
  );
};
