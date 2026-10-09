import { cssVar, LoadingDots } from "@voxel51/voodo";
import React from "react";
import styled from "styled-components";

const BoxDiv = styled.div`
  background: ${cssVar.color.bg.background};
  border: 1px solid ${cssVar.color.border.default};
  border-radius: 2px;
  color: ${cssVar.color.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
`;

export default function Box({
  children,
  text,
}: React.PropsWithChildren<{ text?: string; height?: number }>) {
  const value = text === "Loading" ? <LoadingDots text="Loading" /> : text;
  return (
    <BoxDiv
      style={{
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
