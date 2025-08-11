import { MuiButton, MuiIconFont } from "@fiftyone/components";
import { InfoOutlined } from "@mui/icons-material";
import { Alert, Typography } from "@mui/material";
import { useSetAtom } from "jotai";
import React from "react";
import styled from "styled-components";
import { showSchemaManager } from "./state";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  position: relative;
`;

const ImportSchema = () => {
  const canManage = true;
  const showSchemaModal = useSetAtom(showSchemaManager);
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
        Annotate faster than ever
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Import your dataset schema to access and edit labels, set up attributes,
        and start annotating right away.
      </Typography>
      <MuiButton
        variant="contained"
        color="primary"
        disabled={!canManage}
        onClick={() => showSchemaModal(true)}
      >
        Import schema
      </MuiButton>
      {!canManage && (
        <Alert
          icon={<InfoOutlined fontSize="inherit" color="secondary" />}
          severity="info"
          sx={{
            position: "absolute",
            bottom: 2,
            margin: 2,
            background: "#333",
            boxShadow: "0px 1px 2px 0px rgba(16, 24, 40, 0.05)",
          }}
        >
          <Typography color="secondary" fontSize={12}>
            Dataset managers can import schemas
          </Typography>
        </Alert>
      )}
    </Container>
  );
};

export default ImportSchema;
