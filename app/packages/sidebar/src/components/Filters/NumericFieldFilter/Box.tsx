import { cssVar, LoadingDots } from "@voxel51/voodo";
import React from "react";
import styled from "styled-components";

const BoxDiv = styled.div`
  color: ${cssVar.color.text.secondary};
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
