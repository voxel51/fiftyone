import React, { useRef } from "react";
import styled from "styled-components";

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
  color: #676767;
`;

export const standard = () => {
  const ref = useRef(null);
  return (
    <Main onClick={() => ref.current("message")}>
      Click here to create notifications
      <NotificationHub children={(add) => (ref.current = add)} />
    </Main>
  );
};
