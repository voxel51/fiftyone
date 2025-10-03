import { useTheme } from "@fiftyone/components";
import {
  LockOpenOutlined,
  LockOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import React from "react";
import styled from "styled-components";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  align-items: center;
`;

export const Classification = ({ fill }: { fill: string }) => {
  return (
    <Container>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="21"
        viewBox="0 0 20 21"
        fill="none"
      >
        <path
          d="M5.15625 15.5C4.8125 15.5 4.51823 15.3776 4.27344 15.1328C4.02865 14.888 3.90625 14.5938 3.90625 14.25V6.75C3.90625 6.40625 4.02865 6.11198 4.27344 5.86719C4.51823 5.6224 4.8125 5.5 5.15625 5.5H12.0312C12.2292 5.5 12.4167 5.54427 12.5938 5.63281C12.7708 5.72135 12.9167 5.84375 13.0312 6L15.8438 9.75C16.0104 9.96875 16.0938 10.2188 16.0938 10.5C16.0938 10.7812 16.0104 11.0312 15.8438 11.25L13.0312 15C12.9167 15.1562 12.7708 15.2786 12.5938 15.3672C12.4167 15.4557 12.2292 15.5 12.0312 15.5H5.15625ZM5.15625 14.25H12.0312L14.8438 10.5L12.0312 6.75H5.15625V14.25Z"
          fill={fill}
        />
      </svg>
    </Container>
  );
};

export const Detection = ({ fill }: { fill: string }) => {
  return (
    <Container>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="21"
        viewBox="0 0 20 21"
        fill="none"
      >
        <path
          d="M5.83333 16.5C5.46667 16.5 5.15278 16.3694 4.89167 16.1083C4.63056 15.8472 4.5 15.5333 4.5 15.1667V5.83333C4.5 5.46667 4.63056 5.15278 4.89167 4.89167C5.15278 4.63056 5.46667 4.5 5.83333 4.5H15.1667C15.5333 4.5 15.8472 4.63056 16.1083 4.89167C16.3694 5.15278 16.5 5.46667 16.5 5.83333V15.1667C16.5 15.5333 16.3694 15.8472 16.1083 16.1083C15.8472 16.3694 15.5333 16.5 15.1667 16.5H5.83333ZM5.83333 15.1667H15.1667V5.83333H5.83333V15.1667Z"
          fill={fill}
        />
      </svg>
    </Container>
  );
};

export const Locking = ({ on }: { on: boolean }) => {
  const theme = useTheme();
  const color = on ? theme.text.secondary : theme.text.disabled;
  const Component = on ? LockOutlined : LockOpenOutlined;
  return (
    <Container>
      <Component style={{ color, height: 14, width: 14 }} />
    </Container>
  );
};

export const Shown = ({ on }: { on: boolean }) => {
  const theme = useTheme();
  const color = on ? theme.text.secondary : theme.text.disabled;
  const Component = on ? VisibilityOutlined : VisibilityOffOutlined;
  return (
    <Container>
      <Component style={{ color, height: 14, width: 14 }} />
    </Container>
  );
};

export const ICONS = {
  Classification: Classification,
  Classifications: Classification,
  Detections: Detection,
  Detection: Detection,
};
