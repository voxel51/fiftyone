import { MuiButton, MuiIconFont } from "@fiftyone/components";
import { ArrowForward } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useSetAtom } from "jotai";
import React from "react";
import styled from "styled-components";
import { activeSchemaTab } from "../state";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  margin: -2rem;
  overflow: scroll;
  position: relative;
  & * {
    max-width: 200px;
  }
`;

const NoActiveSchema = () => {
  const setTab = useSetAtom(activeSchemaTab);
  return (
    <Container>
      <MuiIconFont
        sx={{
          fontSize: 64,
          color: "#FF9950",
          marginBottom: 2,
        }}
        name={"draw"}
      />
      <Typography variant="h6" textAlign="center">
        No active schemas yet
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Select fields that you’d like to add schemas to for annotation
      </Typography>
      <MuiButton
        variant="contained"
        color="primary"
        onClick={() => setTab("other")}
      >
        Select fields to import <ArrowForward />
      </MuiButton>
    </Container>
  );
};

export default NoActiveSchema;
