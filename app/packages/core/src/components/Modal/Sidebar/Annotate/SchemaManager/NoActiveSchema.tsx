import { MuiButton, MuiIconFont } from "@fiftyone/components";
import { ArrowForward } from "@mui/icons-material";
import { Typography } from "@mui/material";
import React from "react";
import styled from "styled-components";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  position: relative;
  & * {
    max-width: 200px;
  }
`;

const NoActiveSchema = () => {
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
        No active schema yet
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Select fields that you’d like to import as schema for annotation
      </Typography>
      <MuiButton variant="contained" color="primary" onClick={null}>
        Select fields to import <ArrowForward />
      </MuiButton>
    </Container>
  );
};

export default NoActiveSchema;
