import { LoadingDots } from "@fiftyone/components";
import React from "react";
import styled from "styled-components";

const BoxDiv = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

export default function Box({
  children,
  text,
}: React.PropsWithChildren<{ text?: string }>) {
  const value = text === "Loading" ? <LoadingDots text="Loading" /> : text;
  return (
    <BoxDiv
      style={{
        height: 71,
        display: "flex",
        justifyContent: "center",
        flexDirection: "column",
        textAlign: "center",
      }}
    >
      {children ? children : value}
    </BoxDiv>
  );
}
