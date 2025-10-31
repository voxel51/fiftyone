import { MuiButton, MuiIconFont } from "@fiftyone/components";
import { InfoOutlined } from "@mui/icons-material";
import { Alert, Typography } from "@mui/material";
import React from "react";
import styled from "styled-components";
import useCanManageSchema from "./useCanManageSchema";
import useShowModal from "./useShowModal";

const DISABLED_DEFAULT =
  "Annotation is not yet supported for this type of media or view.";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  position: relative;
`;

export interface ImportSchemaProps {
  disabled?: boolean;
  disabledMsg?: React.ReactNode;
}

const ImportSchema = (
  { disabled, disabledMsg }: ImportSchemaProps = {
    disabled: false,
  }
) => {
  const canManage = useCanManageSchema();
  const showModal = useShowModal();
  return (
    <Container>
      <MuiIconFont
        sx={{
          fontSize: 48,
          color: "#FF9950",
          marginBottom: 2,
        }}
        name={"draw"}
      />
      <Typography variant="h6" textAlign="center">
        Annotate faster than ever
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Add your annotation schemas to access and edit labels, set up
        attributes, and start annotating right away.
      </Typography>
      <MuiButton
        variant="contained"
        color="primary"
        disabled={disabled || !canManage}
        onClick={showModal}
      >
        Add schema
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
            Dataset managers can add schemas
          </Typography>
        </Alert>
      )}
      {disabled && (
        <Alert
          icon={<InfoOutlined fontSize="inherit" color="secondary" />}
          severity="info"
          sx={{
            position: "absolute",
            bottom: 2,
            margin: 2,
            background: "#333",
            boxShadow: "0px 1px 2px 0px rgba(16, 24, 40, 0.05)",
            alignItems: "center",
          }}
        >
          <Typography color="secondary" fontSize={12}>
            {disabledMsg || DISABLED_DEFAULT}
          </Typography>
        </Alert>
      )}
    </Container>
  );
};

export default ImportSchema;
