import React, { useRef } from "react";
import styled from "styled-components";
import { withKnobs, select } from "@storybook/addon-knobs";

import NotificationHub from "./NotificationHub";

export default {
  component: NotificationHub,
  title: "NotificationHub",
  decorators: [withKnobs],
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

const label = "Notification Type";
const options = {
  "Server Error": {
    kind: "Server Error",
    message: ["Some specific error message"],
    app_items: ["A traceback, not used"],
  },
  "Dataset Created": {
    kind: "Dataset Created",
    message: "A dataset has been created",
    app_items: [],
  },
};
const defaultValue = "Server Error";
const groupId = "Notificiation-Group";

export const error = () => {
  const ref = useRef(null);
  const value = select(label, options, defaultValue, groupId);
  console.log(value);
  return (
    <Main onClick={() => ref.current(value)}>
      Click here to create notifications
      <NotificationHub children={(add) => (ref.current = add)} />
    </Main>
  );
};
