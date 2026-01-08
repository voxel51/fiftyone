import { MuiIconFont } from "@fiftyone/components";
import { ArrowForward } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { Button, Size, Variant } from "@voxel51/voodo";
import { useSetAtom } from "jotai";
import React from "react";
import { activeSchemaTab } from "../state";
import { CenteredEmptyState } from "./styled";

const NoActiveSchema = () => {
  const setTab = useSetAtom(activeSchemaTab);
  return (
    <CenteredEmptyState>
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
      <Button
        size={Size.Sm}
        variant={Variant.Primary}
        onClick={() => setTab("other")}
      >
        Select fields to import{" "}
        <ArrowForward fontSize="small" style={{ marginLeft: 4 }} />
      </Button>
    </CenteredEmptyState>
  );
};

export default NoActiveSchema;
