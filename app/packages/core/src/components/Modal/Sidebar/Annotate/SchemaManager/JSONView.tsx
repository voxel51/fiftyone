import { Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import { activeSchemas } from "../state";
import { Container } from "./Components";

const JSONContainer = styled.div`
  flex: 1;
  overflow: auto;
  background: ${({ theme }) => theme.background.level1};
  border-radius: 4px;
  padding: 1rem;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
`;

const JSONView = () => {
  const active = useAtomValue(activeSchemas);

  return (
    <Container style={{ marginBottom: "4rem" }}>
      <Typography color="secondary" padding="0.5rem 0">
        Active schemas (read-only)
      </Typography>
      <JSONContainer>{JSON.stringify(active, null, 2)}</JSONContainer>
    </Container>
  );
};

export default JSONView;
