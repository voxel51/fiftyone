import { MuiButton } from "@fiftyone/components";
import {
  LabelOutlined as Classification,
  CropSquare as Detection,
  InfoOutlined,
  Polyline,
} from "@mui/icons-material";
import { Alert, Typography } from "@mui/material";
import { useSetAtom } from "jotai";
import React from "react";
import styled from "styled-components";
import { activeSchemaTab } from "../state";
import useCanManageSchema from "../useCanManageSchema";
import useShowModal from "../useShowModal";
import { editing } from "./state";

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  position: relative;
  height: 100%;
`;

const ICONS = {
  Classification,
  Detection,
  Polyline,
};

const AddSchema = ({ type }: { type: string }) => {
  const canManage = useCanManageSchema();
  const showModal = useShowModal();
  const setActiveTab = useSetAtom(activeSchemaTab);
  const Icon = ICONS[type];
  const setEditing = useSetAtom(editing);

  return (
    <Container>
      <Icon
        sx={{
          fontSize: 64,
          color: "var(--color-brand-accent)",
          marginBottom: 2,
        }}
      />
      <Typography variant="h6" textAlign="center">
        No {type.toLowerCase()} fields available
      </Typography>
      <Typography color="secondary" textAlign="center" sx={{ marginBottom: 2 }}>
        Add and activate {type?.toLocaleLowerCase()} annotation schemas to
        access and edit labels
      </Typography>
      <MuiButton
        variant="contained"
        color="primary"
        disabled={!canManage}
        onClick={() => {
          setActiveTab("other");
          setEditing(null);
          showModal();
        }}
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
            background: "var(--color-content-bg-muted)",
            boxShadow: "0px 1px 2px 0px rgba(16, 24, 40, 0.05)",
          }}
        >
          <Typography color="secondary" fontSize={12}>
            Dataset managers can add schemas
          </Typography>
        </Alert>
      )}
    </Container>
  );
};

export default AddSchema;
